import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync('work', { recursive: true });
for (const [name,path] of Object.entries({evidence:'lib/evidence.ts',github:'lib/github.ts',llm:'lib/llm.ts',sample:'lib/sample.ts',route:'app/api/analyze/route.ts'})) {
  let source=readFileSync(path,'utf8').replaceAll('@/lib/','./').replace(/from '(\.\/[a-z]+)'/g,"from '$1.mjs'");
  writeFileSync(`work/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
const { normalizeUsername, selectRepositories, groundReport, DISCLAIMER, prepareJobExtraction } = await import('../work/evidence.mjs');
const { sampleReport, sampleJob } = await import('../work/sample.mjs');
const { collectGithub, githubClient } = await import('../work/github.mjs');
const { extractRequirements, extractionInstructions } = await import('../work/llm.mjs');
const { POST } = await import('../work/route.mjs');
const reqs = sampleReport.requirements;
const baseRepo = sampleReport.repositories[0];
const item = (r, category='required_technical_skills', subject='candidate') => ({title:r.title,jobQuote:r.jobQuote,keywords:r.keywords,category,subject,reasoning:'Explicit statement in job description.'});
test('normalizes usernames and profile URLs without accepting repository or attacker URLs', () => {
  for (const input of [' OctoCat ', 'https://github.com/OctoCat/', 'github.com/OctoCat', 'https://github.com/OctoCat?tab=repositories']) assert.equal(normalizeUsername(input), 'octocat');
  for (const input of ['https://github.com/octocat/repo', 'https://github.com.evil.test/alice', 'https://github.com@evil.test/alice', 'https://github.com/', 'a--b', '-a', 'a-', 'a'.repeat(40), 'file:///etc/passwd']) assert.throws(() => normalizeUsername(input));
});

test('Jack & Jill product context stays out of candidate requirements, including mislabeled employer subjects', () => {
  // Synthetic regression fixture based on the user's examples, not the full unseen job advert.
  const quotes=['we have released two agentic products','Jack helps candidates find jobs.','Jill helps employers find candidates.','You will build backend services.','You must know Python.','You communicate clearly.','We offer equity.','Apply today.'];
  const job=quotes.join('\n');
  const entries=quotes.map((jobQuote,i)=>item({title:jobQuote,jobQuote,keywords:['agentic']},['responsibilities','required_technical_skills','company_product_context','responsibilities','required_technical_skills','behavioural_working_style','perks_compensation','irrelevant_description'][i],i===0?'candidate':i<3?'employer_product':i<6?'candidate':'other'));
  const result=prepareJobExtraction(job,{items:entries});
  assert.deepEqual(result.items.slice(0,3).map(x=>x.category),Array(3).fill('company_product_context'));
  assert.deepEqual(result.requirements.map(x=>x.jobQuote),quotes.slice(3,6));
  assert.deepEqual(result.requirements[2].keywords,[]);
  assert.ok(extractionInstructions.includes('Explanations of what Jack does and what Jill does'));
});

test('genuine candidate agentic-product responsibility remains eligible',()=>{
  const job='You will build agentic products.';
  const result=prepareJobExtraction(job,{items:[item({title:job,jobQuote:job,keywords:['agentic']},'responsibilities')]});
  assert.equal(result.requirements.length,1);
});

test('browser keys are rejected and cannot enable analysis without a server key',async()=>{
  const previous=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
  try {
    const request=body=>new Request('http://localhost/api/analyze',{method:'POST',body:JSON.stringify(body)});
    const supplied=await POST(request({github:'alice',job:sampleJob,apiKey:'browser-key'}));assert.equal(supplied.status,400);assert.ok(!(await supplied.text()).includes('browser-key'));
    const missing=await POST(request({github:'alice',job:sampleJob}));assert.equal(missing.status,503);
    assert.ok(!readFileSync('app/page.tsx','utf8').includes('apiKey'));
    assert.ok(!readFileSync('app/page.tsx','utf8').includes('OPENAI_API_KEY'));
  }finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;}
});
test('ranks relevance ahead of popularity, excludes private/empty repositories, caps at five', () => {
  const repos = Array.from({length: 8}, (_,i)=>({...baseRepo, name:`repo-${i}`, full_name:`alice/repo-${i}`, description:'Python API', stargazers_count:i}));
  repos.push({...baseRepo, name:'popular', language:'Ruby', topics:[], description:'Unrelated', stargazers_count:100000});
  repos.push({...baseRepo, name:'private', private:true}, {...baseRepo, name:'empty', size:0});
  const selected=selectRepositories(repos,reqs);
  assert.equal(selected.length,5); assert.ok(selected.every(r=>!['popular','private','empty'].includes(r.name)));
});
test('rejects fabricated citations, caps indirect evidence, and retains every requirement', () => {
  const repo={...baseRepo,sources:[{id:'meta',repo:'alice/api',path:'README.md',kind:'readme',text:'This project uses Python for an API.',url:'https://github.com/alice/api'}]};
  const result=groundReport({assessments:[{requirementId:'q1',level:'Strong public evidence',reasoning:'README says so',evidence:[{sourceId:'meta',quote:'This project uses Python',relevance:'Mention'},{sourceId:'fake',quote:'fabricated text',relevance:'Invalid'}]}],skills:[],questions:[]},reqs,[repo]);
  assert.equal(result.assessments.length,reqs.length);
  assert.equal(result.assessments[0].level,'Limited public evidence'); assert.equal(result.assessments[0].evidence.length,1);
  assert.ok(result.assessments.slice(1).every(a=>a.level==='No public evidence found')); assert.equal(result.rejected,1);
});
test('fabricated text with a real source ID cannot support a match',()=>{
  const raw={assessments:[{requirementId:'q1',level:'Strong public evidence',reasoning:'unsupported',evidence:[{sourceId:'s1',quote:'This text is not in the source',relevance:'invalid'}]}],skills:[{name:'Kubernetes',sourceIds:['invented']}],questions:[{question:'Bad',sourceId:'invented'}]};
  const result=groundReport(raw,reqs,[baseRepo]); assert.equal(result.assessments[0].level,'No public evidence found'); assert.equal(result.skills.length,0); assert.equal(result.questions.length,0);
});
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const repoFixture={...baseRepo, name:'api', full_name:'alice/api', private:false, description:'Python REST API', topics:['python'], default_branch:'main'};
function githubMock(url) {
  const u=new URL(url);
  if(u.pathname==='/users/alice')return json({login:'alice',name:'Alice',public_repos:1,type:'User'});
  if(u.pathname==='/users/alice/repos')return json([repoFixture]);
  if(u.pathname.endsWith('/languages'))return json({Python:100});
  if(u.pathname.endsWith('/commits'))return json([{sha:'abcdef123',commit:{message:'Add endpoint',committer:{date:'2026-01-01'}}}]);
  if(u.pathname.includes('/git/trees/'))return json({truncated:false,tree:[{path:'README.md',type:'blob',size:100},{path:'app.py',type:'blob',size:100}]});
  if(u.pathname.includes('/contents/'))return json({type:'file',encoding:'base64',content:Buffer.from(u.pathname.endsWith('app.py')?'from fastapi import FastAPI\napp = FastAPI()':'A Python REST API example').toString('base64')});
  throw new Error(`Unexpected request: ${u.pathname}`);
}
test('collects actual categories and pins file citations to the retrieved commit',async()=>{
  const data=await collectGithub('alice',reqs,undefined,async url=>githubMock(url));
  assert.equal(data.repositories.length,1); const sources=data.repositories[0].sources;
  for(const kind of ['metadata','activity','structure','readme','source'])assert.ok(sources.some(s=>s.kind===kind));
  assert.ok(sources.filter(s=>s.kind==='source').every(s=>s.url.includes('/blob/abcdef123/')));
});
test('provider failure becomes a partial-inspection warning, never invented file evidence',async()=>{
  const data=await collectGithub('alice',reqs,undefined,async url=>url.includes('/git/trees/')?json({},500):githubMock(url));
  assert.ok(data.repositories[0].warnings.some(w=>w.includes('inspection failed')));
  assert.ok(!data.repositories[0].sources.some(s=>s.kind==='source'));
});
test('GitHub rate limits and missing profiles have clear failures',async()=>{
  await assert.rejects(githubClient(undefined,async()=>json({},403))('/users/alice'),/rate limit/);
  await assert.rejects(githubClient(undefined,async()=>json({},404))('/users/alice'),/not found/);
});
test('rejects job requirements that are not exact quotes from the job',async()=>{
  const transport=async()=>json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({items:[item({title:'Invented',jobQuote:'not supplied',keywords:[]})]})}]}]});
  await assert.rejects(extractRequirements(sampleJob,'test','test',transport),/not grounded/);
});
test('API route exercises extraction, GitHub collection, matching and citation grounding',async()=>{
  const original=globalThis.fetch; const previousKey=process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY='server-test-secret';
  globalThis.fetch=async(url,init)=>{
    if(String(url).startsWith('https://api.github.com'))return githubMock(url);
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization,'Bearer server-test-secret'); const body=JSON.parse(init.body); assert.equal(body.store,false); assert.ok(!JSON.stringify(body).includes('server-test-secret'));
    if(body.text.format.name==='requirements')return json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({items:[item(reqs[0]),item(reqs[4])]})}]}]});
    const input=JSON.parse(body.input); const src=input.repositories[0].sources.find(s=>s.kind==='source');
    const result={assessments:[{requirementId:'q1',level:'Strong public evidence',reasoning:'An API framework is instantiated; broader REST implementation is not shown.',evidence:[{sourceId:src.id,quote:'from fastapi import FastAPI',relevance:'Imports an API framework'}]},{requirementId:'q2',level:'No public evidence found',reasoning:'No AWS artifacts in sample.',evidence:[]}],skills:[{name:'FastAPI',sourceIds:[src.id]}],questions:[{question:'What was your contribution to api?',sourceId:src.id}]};
    return json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
  };
  try {
    const response=await POST(new Request('http://localhost/api/analyze',{method:'POST',body:JSON.stringify({github:'https://github.com/Alice/',job:sampleJob})}));
    assert.equal(response.status,200);const report=await response.json();
    assert.equal(report.candidate.login,'alice');assert.equal(report.assessments[0].level,'Moderate public evidence');assert.equal(report.assessments[1].level,'No public evidence found');assert.ok(report.summary.includes(DISCLAIMER)); assert.equal(report.demo,false);
  }finally{globalThis.fetch=original; if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
});
test('API validates malformed input before making provider calls',async()=>{
  for(const body of ['not json',JSON.stringify({github:'https://evil.test/alice',job:sampleJob}),JSON.stringify({github:'alice',job:'short'})]) {
    const response=await POST(new Request('http://localhost/api/analyze',{method:'POST',body})); assert.equal(response.status,400);
  }
});
