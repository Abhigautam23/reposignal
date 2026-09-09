import { z } from 'zod';
import { normalizeUsername, groundReport, DISCLAIMER, levels, type Report } from '@/lib/evidence';
import { collectGithub, GitHubError } from '@/lib/github';
import { extractJobDescription, matchEvidence } from '@/lib/llm';

export const maxDuration = 300;
const inputSchema = z.object({ github: z.string().min(1).max(200), job: z.string().trim().min(30).max(16000) }).strict();
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const text = await request.text();
    if (text.length > 20000) return Response.json({ error: 'Please keep the job description below 16,000 characters.' }, { status: 413, headers });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers }); }
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Enter a GitHub profile and a job description between 30 and 16,000 characters.' }, { status: 400, headers });
    let username: string;
    try { username = normalizeUsername(parsed.data.github); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400, headers }); }
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) return Response.json({ error: 'Live analysis is not configured. Ask the deployment owner to set OPENAI_API_KEY on the server. The sample report remains available.' }, { status: 503, headers });
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const { requirements, items: jobItems } = await extractJobDescription(parsed.data.job, key, model);
    if (!requirements.length) return Response.json({ error: 'No explicit candidate responsibilities, technical skills, or working-style expectations were found. Company/product descriptions are not candidate requirements.', jobItems }, { status: 422, headers });
    const collected = await collectGithub(username, requirements, process.env.GITHUB_TOKEN);
    const raw = collected.repositories.length ? await matchEvidence(requirements, collected.repositories, key, model) : { assessments: [], skills: [], questions: [] };
    const grounded = groundReport(raw, requirements, collected.repositories);
    const found = grounded.assessments.filter(a => a.level !== levels[3]).length;
    const report: Report = { ...collected, ...grounded, requirements, jobItems, summary: `${found} of ${requirements.length} candidate expectations have cited public signals in ${collected.repositories.length} inspected repositories. This is an evidence coverage summary, not a hiring recommendation or a measure of ability. Individual contribution, depth and experience outside the inspected sample require discussion. ${DISCLAIMER}`, warnings: [...collected.warnings, ...(grounded.rejected ? [`${grounded.rejected} unverified or duplicate citations were excluded; affected evidence levels were reduced where necessary.`] : [])], generatedAt: new Date().toISOString(), demo: false };
    return Response.json(report, { headers });
  } catch (e) {
    const message = e instanceof Error && e.name === 'TimeoutError' ? 'A data provider timed out. Please try again.' : e instanceof Error ? e.message.replaceAll(process.env.OPENAI_API_KEY || '\u0000', '[redacted]') : 'Analysis failed. Please try again.';
    return Response.json({ error: message }, { status: e instanceof GitHubError ? e.status : 502, headers });
  }
}
