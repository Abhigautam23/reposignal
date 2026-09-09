'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, GitFork, GitBranch as Github, FileCode2, Search, ShieldCheck, ExternalLink, Layers3, LoaderCircle, ChevronDown, Code2, MessageSquare, FileText, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { DISCLAIMER, categories, categoryLabels, mappedCategories, levels, normalizeUsername, type Report, type Source } from '@/lib/evidence';
import { sampleJob, sampleReport } from '@/lib/sample';

function SourceLabel({ source }: { source: Source }) { return source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="source-link"><FileCode2 size={14}/>{source.repo} · {source.path}<ExternalLink size={12}/></a> : <span className="source-link"><FileCode2 size={14}/>{source.repo} · {source.path} <small>sample</small></span>; }
function Badge({ level }: { level: string }) { return <span className={`evidence-badge level-${levels.indexOf(level as typeof levels[number])}`}><span className="strength-bars" aria-hidden="true"><i/><i/><i/></span>{level}</span>; }
export default function Home() {
  const [github, setGithub] = useState('');
  const [job, setJob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState('mapping');
  const running = useRef(false);
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setElapsed(s => s+1), 1000); return () => clearInterval(timer); }, [busy]);
  const analyze = useCallback(async (profile: string, description: string) => {
    if (running.current) throw new Error('An analysis is already running.');
    normalizeUsername(profile);
    if (description.trim().length < 30 || description.length > 16000) throw new Error('Paste a job description between 30 and 16,000 characters.');
    running.current = true; setBusy(true); setElapsed(0); setError(''); setReport(null); setGithub(profile); setJob(description);
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ github: profile, job: description }), signal: AbortSignal.timeout(290000) });
      const data = await response.json() as Report & { error?: string };
      if (!response.ok) { throw new Error(data.error || 'Analysis failed. Please try again.'); }
      setReport(data); setTab('mapping'); return { candidate: data.candidate.login, repositories: data.repositories.length, requirements: data.requirements.length, summary: data.summary };
    } catch (e) { const message = e instanceof Error ? e.message : 'Analysis failed. Please try again.'; setError(message); throw e; }
    finally { running.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    type Context = { registerTool: (tool: { name: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => Promise<unknown> }, options: { signal: AbortSignal }) => unknown };
    const context = (document as Document & { modelContext?: Context }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try { void Promise.resolve(context.registerTool({ name: 'analyze_github_evidence', description: 'Run a public GitHub evidence analysis against job requirements and display the report. Uses the configured analysis API key and may incur API charges.', inputSchema: { type: 'object', properties: { github: { type: 'string' }, job: { type: 'string' } }, required: ['github','job'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: async input => { const value = input as { github?: unknown; job?: unknown }; if (typeof value?.github !== 'string' || typeof value?.job !== 'string') throw new Error('github and job must be strings.'); return analyze(value.github, value.job); } }, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser capability. */ }
    return () => lifecycle.abort();
  }, [analyze]);
  const showSample = () => { setGithub('sample-candidate'); setJob(sampleJob); setReport(sampleReport); setError(''); setTab('mapping'); };
  const found = report?.assessments.filter(a => a.level !== levels[3]).length ?? 0;
  return <div className="app-shell">
    <header className="topbar"><Link className="brand" href="/" aria-label="RepoSignal home"><span className="brand-icon"><Code2 size={21}/></span>RepoSignal<span className="demo-label">DEMO</span></Link><span className="header-note"><ShieldCheck size={16}/>Public evidence. Human judgment.</span></header>
    <main className="workspace">
      <div className="page-heading"><div><p className="eyebrow">TECHNICAL CANDIDATE REVIEW</p><h1>Let the work speak.</h1><p>Connect public project evidence to the requirements that matter.</p></div><div className="scope-tag"><Layers3 size={16}/>Up to 5 repositories</div></div>
      <div className="workspace-grid">
        <aside className="input-panel">
          <div className="panel-title"><span className="step-number">01</span><h2>Set up your analysis</h2></div>
          <form onSubmit={e => { e.preventDefault(); void analyze(github, job).catch(e => setError(e.message)); }}>
            <label htmlFor="github"><Github size={16}/>GitHub profile</label>
            <Input id="github" value={github} onChange={e => setGithub(e.target.value)} placeholder="username or github.com/username" maxLength={200} required disabled={busy} autoComplete="off" spellCheck={false}/>
            <p className="field-hint">A username or a full profile URL works.</p>
            <label className="job-label" htmlFor="job"><FileText size={16}/>Job description</label>
            <Textarea id="job" value={job} onChange={e => setJob(e.target.value)} placeholder={'Paste the role’s technical requirements…\n\nInclude the technologies, engineering practices, and project experience you’re looking for.'} minLength={30} maxLength={16000} required disabled={busy}/>
            <div className="field-footer"><span>Candidate expectations are separated from company context</span><span>{job.length.toLocaleString()}/16k</span></div>
            <p className="field-hint" style={{ margin: "18px 0" }}>Job text and sampled public code are sent to OpenAI for analysis.</p>
            {error && <p className="error" role="alert">{error}</p>}
            <Button className="analyze-button" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin"/>Analyzing public evidence…</> : <>Analyze evidence<ArrowRight/></>}</Button>
            <Button variant="ghost" type="button" className="sample-button" onClick={showSample} disabled={busy}>Explore a sample report</Button>
          </form>
          <div className="scope-note"><ShieldCheck size={19}/><p>Public repositories only.<br/>No candidate account or sign-in needed.</p></div>
        </aside>
        <section className="report-area" aria-busy={busy}>
          <div className="report-heading"><div className="panel-title"><span className="step-number">02</span><h2>Evidence report</h2></div><span className="report-state">{busy ? 'IN PROGRESS' : report ? report.demo ? 'SAMPLE REPORT' : 'ANALYSIS COMPLETE' : 'READY WHEN YOU ARE'}</span></div>
          <div className="principle"><Info size={17}/><p>{DISCLAIMER}</p></div>
          {!report && <Empty className="report-empty"><EmptyHeader><div className="empty-symbol">{busy ? <LoaderCircle size={32} className="spin"/> : <Search size={32}/>}</div><EmptyTitle>{busy ? 'Following the evidence' : 'From repositories to reasons.'}</EmptyTitle><EmptyDescription>{busy ? `Extracting requirements, inspecting public projects, and checking citations. This can take a few minutes. ${elapsed}s elapsed.` : 'Add a GitHub profile and job description to see what the public work supports—and what needs a conversation.'}</EmptyDescription></EmptyHeader><div className="empty-steps"><div><span>1</span>Find relevant projects</div><div><span>2</span>Inspect technical evidence</div><div><span>3</span>Explain each match</div></div>{!busy && <p className="empty-footnote">Every assessment includes a reason. Every signal has a source.</p>}</Empty>}
          {report && <div className="report-content">
            {report.demo && <div className="sample-notice">Illustrative sample · Fictional candidate and code snippets · No live analysis</div>}
            <div className="candidate"><div className="avatar"><Github size={25}/></div><div><h3>{report.candidate.name || report.candidate.login}</h3>{report.candidate.html_url ? <a href={report.candidate.html_url} target="_blank" rel="noreferrer">@{report.candidate.login}<ExternalLink size={12}/></a> : <span className="muted">@{report.candidate.login}</span>}</div><div className="candidate-count"><strong>{report.repositories.length}</strong><span>repositories inspected</span></div></div>
            <div className="coverage"><div><strong>{found}<span> / {report.requirements.length}</span></strong><p>requirements with cited signals</p></div><div className="coverage-explainer">Evidence coverage, not a candidate score.<br/>{report.scanned} of {report.candidate.public_repos} public repositories considered.</div></div>
            <details className="methodology"><summary>Job description breakdown<ChevronDown size={15}/></summary><p>Only responsibilities, required technical skills, and working-style expectations enter mapping. Company/product context, perks, and descriptive content are excluded.</p>{categories.map(category => <section key={category}><h3>{categoryLabels[category]} <small>{(mappedCategories as readonly string[]).includes(category) ? ' · eligible for mapping' : ' · excluded'}</small></h3>{report.jobItems?.filter(item => item.category === category).map((item, index) => <div className="job-quote" key={index}><p>“{item.jobQuote}”</p><p>{item.reasoning}</p></div>)}{!report.jobItems?.some(item => item.category === category) && <p>No statements classified in this category.</p>}</section>)}</details>
            <Tabs value={tab} onValueChange={setTab}><TabsList variant="line" className="report-tabs"><TabsTrigger value="mapping">Requirement mapping</TabsTrigger><TabsTrigger value="repositories">Repositories <span>{report.repositories.length}</span></TabsTrigger><TabsTrigger value="interview">Interview questions</TabsTrigger></TabsList>
              <TabsContent value="mapping"><div className="section-intro"><h3>What the public work supports</h3><p>Expand a requirement to inspect the reasoning and original evidence.</p></div>{report.assessments.map((a,i) => { const req = report.requirements.find(r => r.id === a.requirementId)!; return <details className="assessment" key={a.requirementId} open={i === 0}><summary><span className="requirement-title"><span className="row-number">{String(i+1).padStart(2,'0')}</span>{req.title}</span><Badge level={a.level}/><ChevronDown size={15}/></summary><div className="assessment-body"><div className="job-quote"><span>FROM THE JOB DESCRIPTION</span><p>“{req.jobQuote}”</p></div><p>{a.reasoning}</p>{a.evidence.map((e,j) => <div className="citation" key={`${e.sourceId}-${j}`}><SourceLabel source={e.source}/><pre>{e.quote}</pre><p>{e.relevance}</p></div>)}{!a.evidence.length && <p className="no-evidence-note">{DISCLAIMER}</p>}</div></details>; })}
                <div className="summary-block"><h3><Check size={17}/>Evidence-based fit summary</h3><p>{report.summary}</p></div>
                <div className="skills-block"><h3>Technical skills with cited signals</h3>{report.skills.length ? <div className="skill-list">{report.skills.map(s => <span key={s.name} title={s.sourceIds.join(', ')}>{s.name}</span>)}</div> : <p className="muted">No verifiable skill signals were extracted from this sample.</p>}</div>
                <div className="gaps-block"><h3>Gaps in the public evidence</h3>{report.assessments.some(a => a.level === levels[3]) ? <ul>{report.assessments.filter(a => a.level === levels[3]).map(a => <li key={a.requirementId}>{report.requirements.find(r=>r.id===a.requirementId)?.title} — no public evidence found in the inspected sample.</li>)}</ul> : <p>Each extracted requirement has at least one cited signal. This does not establish full proficiency.</p>}</div>
              </TabsContent>
              <TabsContent value="repositories"><div className="section-intro"><h3>Selected for relevance</h3><p>Ranked by job keyword overlap in names, descriptions, languages and topics. Ties favor original, unarchived projects, then recent pushes. Stars do not affect selection.</p></div>{!report.repositories.length && <p>No eligible nonempty public repositories were returned.</p>}{report.repositories.map(r => <article className="repo-card" key={r.full_name}><h3><GitFork size={17}/>{r.name}{r.fork && <span className="small-tag">Fork</span>}{r.archived && <span className="small-tag">Archived</span>}</h3><p>{r.description || 'No repository description provided.'}</p><div className="repo-meta">{r.languages.join(' · ') || 'Languages unavailable'}<span>Last push: {r.pushed_at.slice(0,10)}</span></div><div className="selection-reason"><strong>Why selected</strong><p>{r.selectionReason}</p></div>{r.warnings.map((w,i)=><p className="warning-text" key={i}>{w}</p>)}<details className="source-inventory"><summary>{r.sources.length} inspected sources<ChevronDown size={14}/></summary>{r.sources.map(s=><details key={s.id} className="raw-source"><summary><FileCode2 size={14}/>{s.path}<span>{s.kind}</span></summary><SourceLabel source={s}/><pre>{s.text}</pre></details>)}</details></article>)}</TabsContent>
              <TabsContent value="interview"><div className="section-intro"><h3>Turn signals into a conversation</h3><p>Use these project-specific questions to explore contribution, technical choices, and depth.</p></div>{report.questions.length ? report.questions.map((q,i)=><article className="question-card" key={i}><span className="question-number">{String(i+1).padStart(2,'0')}</span><div><p>{q.question}</p><SourceLabel source={q.source}/></div><MessageSquare size={18}/></article>) : <p>No grounded project questions could be generated from the available sources.</p>}</TabsContent>
            </Tabs>
            <details className="methodology"><summary>Scope & limitations<ChevronDown size={15}/></summary><p>Up to 300 recently pushed public repositories are ranked; only the top five are inspected. Each inspection includes metadata, language breakdown, three recent commit messages, a bounded file tree and up to six README, source, test and configuration files (7,000 characters per file). Content links use a commit snapshot when available; metadata and languages reflect fetch time.</p><p>Automated citation checks verify exact text and source identity, not the correctness of the model’s interpretation. Strong evidence needs complementary direct sources; metadata-only assessments are capped at limited. Dependencies, README claims and activity do not prove implementation, production usage, or personal contribution. Private work and other contributions are outside scope.</p>{report.warnings.map((w,i)=><p className="warning-text" key={i}>{w}</p>)}<p>Report generated {report.generatedAt.replace('T',' ').slice(0,19)} UTC.</p></details>
          </div>}
        </section>
      </div>
      <footer className="footer"><span>RepoSignal</span><p>Evidence informs the conversation. People make the decision.</p><span>PUBLIC GITHUB ONLY</span></footer>
    </main>
  </div>;
}
