import { z } from 'zod';

export const DISCLAIMER = 'No public evidence found is not evidence that the candidate lacks this skill.';
export const levels = ['Strong public evidence', 'Moderate public evidence', 'Limited public evidence', 'No public evidence found'] as const;
export const categories = ['company_product_context', 'responsibilities', 'required_technical_skills', 'behavioural_working_style', 'perks_compensation', 'irrelevant_description'] as const;
export const categoryLabels: Record<typeof categories[number], string> = { company_product_context: 'Company / product context', responsibilities: 'Responsibilities', required_technical_skills: 'Required technical skills', behavioural_working_style: 'Behavioural / working style', perks_compensation: 'Perks / compensation', irrelevant_description: 'Irrelevant descriptive content' };
export const mappedCategories = ['responsibilities', 'required_technical_skills', 'behavioural_working_style'] as const;
export const requirementSchema = z.object({ items: z.array(z.object({ title: z.string(), jobQuote: z.string(), category: z.enum(categories), subject: z.enum(['candidate', 'employer_product', 'other']), reasoning: z.string(), keywords: z.array(z.string()) })).max(60) });
export type JobItem = z.infer<typeof requirementSchema>['items'][number];
export type Requirement = { id: string; title: string; jobQuote: string; keywords: string[]; category?: typeof mappedCategories[number] };
export function prepareJobExtraction(job: string, result: z.infer<typeof requirementSchema>) {
  if (result.items.some(r => !r.jobQuote.trim() || !job.includes(r.jobQuote))) throw new Error('Some extracted statements were not grounded in the supplied job description. Please retry.');
  const items = result.items.map(item => {
    const productRelease = /\bwe\s+(?:have\s+)?(?:released|launched|shipped)\b[^.!?]*\bproducts?\b/i.test(item.jobQuote);
    return item.subject === 'employer_product' || productRelease ? { ...item, category: 'company_product_context' as const, subject: 'employer_product' as const, keywords: [], reasoning: 'Describes the employer or its existing product, not an expectation of the candidate.' } : item;
  });
  const eligible = items.filter(i => i.subject === 'candidate' && (mappedCategories as readonly string[]).includes(i.category));
  if (eligible.length > 16) throw new Error('More than 16 candidate requirements were extracted. Please narrow the job description to avoid silently omitting requirements.');
  const requirements: Requirement[] = eligible.map((r, i) => ({ id: `q${i+1}`, title: r.title, jobQuote: r.jobQuote, keywords: r.category === 'behavioural_working_style' ? [] : r.keywords, category: r.category as Requirement['category'] }));
  return { items, requirements };
}
export const matchSchema = z.object({ assessments: z.array(z.object({ requirementId: z.string(), level: z.enum(levels), reasoning: z.string(), evidence: z.array(z.object({ sourceId: z.string(), quote: z.string(), relevance: z.string() })).max(8) })).max(16), skills: z.array(z.object({ name: z.string(), sourceIds: z.array(z.string()) })).max(30), questions: z.array(z.object({ question: z.string(), sourceId: z.string() })).max(8) });
export type Match = z.infer<typeof matchSchema>;
export type Source = { id: string; repo: string; path: string; url: string; kind: 'metadata' | 'readme' | 'structure' | 'config' | 'source' | 'activity'; text: string };
export type Repo = { name: string; full_name: string; description: string | null; language: string | null; topics: string[]; fork: boolean; archived: boolean; disabled: boolean; private: boolean; size: number; pushed_at: string; default_branch: string; stargazers_count: number };
export type SelectedRepo = Repo & { selectionReason: string; matchedKeywords: string[]; sources: Source[]; warnings: string[]; languages: string[]; commit: string | null };
export type Report = { jobItems?: JobItem[]; candidate: { login: string; name: string | null; public_repos: number; html_url: string }; requirements: Requirement[]; repositories: SelectedRepo[]; assessments: (Omit<Match['assessments'][number], 'evidence'> & { evidence: (Match['assessments'][number]['evidence'][number] & { source: Source })[] })[]; skills: Match['skills']; questions: (Match['questions'][number] & { source: Source })[]; summary: string; warnings: string[]; scanned: number; generatedAt: string; demo: boolean };

export function normalizeUsername(input: string): string {
  let value = input.trim();
  if (/^(https?:\/\/|(?:www\.)?github\.com\/)/i.test(value)) {
    let url: URL;
    try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { throw new Error('Enter a valid GitHub username or profile URL.'); }
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port || !/^\/[A-Za-z0-9-]+\/?$/.test(url.pathname)) throw new Error('Use a GitHub profile URL, such as https://github.com/username, rather than a repository link.');
    value = url.pathname.split('/')[1];
  }
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(value)) throw new Error('Enter a valid GitHub username or full profile URL.');
  return value.toLowerCase();
}

export function selectRepositories(repos: Repo[], requirements: Requirement[]): (Repo & { matchedKeywords: string[]; selectionReason: string })[] {
  const keywords = [...new Set(requirements.flatMap(r => r.keywords).map(k => k.toLowerCase().trim()).filter(k => k.length > 1))];
  return repos.filter(r => !r.private && !r.disabled && r.size > 0).map(r => {
    const haystack = `${r.name} ${r.description ?? ''} ${r.language ?? ''} ${(r.topics ?? []).join(' ')}`.toLowerCase();
    const matchedKeywords = keywords.filter(k => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(haystack));
    return { ...r, matchedKeywords, selectionReason: matchedKeywords.length ? `Metadata overlaps with ${matchedKeywords.join(', ')}. Content is inspected below to verify these signals.` : 'No direct metadata keyword overlap; selected by recency after higher-overlap repositories as an exploratory sample.' };
  }).sort((a, b) => b.matchedKeywords.length - a.matchedKeywords.length || Number(a.fork) - Number(b.fork) || Number(a.archived) - Number(b.archived) || b.pushed_at.localeCompare(a.pushed_at)).slice(0, 5);
}

export function groundReport(raw: Match, requirements: Requirement[], repos: SelectedRepo[]) {
  const sources = new Map(repos.flatMap(r => r.sources).map(s => [s.id, s]));
  let rejected = 0;
  const assessments = requirements.map(req => {
    const match = raw.assessments.find(a => a.requirementId === req.id);
    const seen = new Set<string>();
    const evidence = (match?.evidence ?? []).flatMap(e => {
      const source = sources.get(e.sourceId);
      if (!source || e.quote.trim().length < 8 || !source.text.includes(e.quote) || seen.has(e.sourceId)) { rejected++; return []; }
      seen.add(e.sourceId); return [{ ...e, source }];
    });
    let level = match?.level ?? levels[3];
    let reasoning = match?.reasoning ?? 'No assessment was returned for this requirement in the inspected public sample.';
    if (!evidence.length) { level = levels[3]; reasoning = 'No verifiable supporting citation was found in the inspected public repository sample. Private work, other repositories, and uninspected files are outside this assessment.'; }
    else if (level === levels[3]) { return { requirementId: req.id, level, reasoning, evidence: [] }; }
    else {
      const direct = evidence.filter(e => ['source', 'config'].includes(e.source.kind));
      if (!direct.length) level = levels[2];
      else if (level === levels[0] && (direct.length < 2 || !direct.some(e => e.source.kind === 'source'))) level = levels[1];
      if (level !== match?.level) reasoning += ' The displayed level is capped because the verified citations do not meet the stronger evidence threshold.';
    }
    return { requirementId: req.id, level, reasoning, evidence };
  });
  const cited = new Set(assessments.flatMap(a => a.evidence.map(e => e.sourceId)));
  const skills = raw.skills.map(s => ({ ...s, sourceIds: s.sourceIds.filter(id => cited.has(id)) })).filter(s => s.sourceIds.length);
  const questions = raw.questions.flatMap(q => { const source = sources.get(q.sourceId); return source ? [{ ...q, source }] : []; });
  return { assessments, skills, questions, rejected };
}
