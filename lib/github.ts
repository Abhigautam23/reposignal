import { selectRepositories, type Requirement, type Repo, type SelectedRepo, type Source } from './evidence';

type Transport = typeof fetch;
export class GitHubError extends Error { constructor(message: string, public status: number) { super(message); } }
export function githubClient(token?: string, transport: Transport = fetch) {
  return async function get<T>(path: string): Promise<T> {
    const response = await transport(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'RepoSignal-Demo', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) throw new GitHubError('GitHub rate limit or access restriction reached. Try later, or configure a server-side GITHUB_TOKEN for public read access.', 429);
      if (response.status === 404) throw new GitHubError('GitHub profile or repository data was not found or is no longer public.', 404);
      throw new GitHubError(`GitHub could not return data (HTTP ${response.status}). Try again later.`, 502);
    }
    return response.json() as Promise<T>;
  };
}

export async function collectGithub(username: string, requirements: Requirement[], token?: string, transport: Transport = fetch) {
  const get = githubClient(token, transport);
  const profile = await get<{ login: string; name: string | null; public_repos: number; type: string }>(`/users/${username}`);
  if (profile.type !== 'User') throw new GitHubError('This is an organization. Enter an individual GitHub profile for candidate analysis.', 400);
  const repos: Repo[] = [];
  const warnings: string[] = [];
  // Bounded pagination keeps the demo predictable for very large profiles.
  for (let page = 1; page <= 3; page++) {
    const batch = await get<Repo[]>(`/users/${username}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page=${page}`);
    repos.push(...batch.filter(r => !r.private));
    if (batch.length < 100) break;
  }
  if (profile.public_repos > repos.length) warnings.push(`Repository discovery is limited to the 300 most recently pushed repositories; ${repos.length} were returned out of ${profile.public_repos} public repositories.`);
  const selected = selectRepositories(repos, requirements);
  const repositories: SelectedRepo[] = [];
  // Sequential repositories and at most three simultaneous requests avoid request bursts.
  for (const [index, repo] of selected.entries()) {
    const base = `/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}`;
    const repoUrl = `https://github.com/${username}/${encodeURIComponent(repo.name)}`;
    const sources: Source[] = [];
    const localWarnings: string[] = [];
    const add = (path: string, kind: Source['kind'], text: string, url: string) => sources.push({ id: `r${index + 1}s${sources.length + 1}`, repo: repo.full_name, path, kind, text, url });
    add('Repository metadata', 'metadata', JSON.stringify({ description: repo.description, topics: repo.topics, primaryLanguage: repo.language, fork: repo.fork, archived: repo.archived }), repoUrl);
    let languages: string[] = [];
    let commit: string | null = null;
    const outcomes = await Promise.allSettled([
      get<Record<string, number>>(`${base}/languages`),
      get<{ sha: string; commit: { message: string; committer: { date: string } } }[]>(`${base}/commits?per_page=3`),
    ]);
    if (outcomes[0].status === 'fulfilled') { languages = Object.keys(outcomes[0].value); add('Language breakdown', 'metadata', JSON.stringify(outcomes[0].value), repoUrl); }
    else localWarnings.push('Language breakdown could not be retrieved.');
    if (outcomes[1].status === 'fulfilled' && outcomes[1].value.length) { commit = outcomes[1].value[0].sha; add('Recent commits', 'activity', outcomes[1].value.map(c => `${c.commit.committer.date}: ${c.commit.message.slice(0, 350)}`).join('\n'), `${repoUrl}/commits`); }
    else localWarnings.push('Recent commits unavailable; file links use the current default branch.');
    const ref = commit ?? repo.default_branch;
    try {
      const tree = await get<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(`${base}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
      const files = tree.tree.filter(f => f.type === 'blob' && !/(^|\/)(node_modules|vendor|dist|build|\.git)(\/|$)/.test(f.path));
      const visible = files.slice(0, 1200);
      if (tree.truncated || files.length > visible.length) localWarnings.push('File structure is truncated; this is a partial inspection.');
      add('File structure', 'structure', visible.map(f => f.path).join('\n').slice(0, 14000), `${repoUrl}/tree/${encodeURIComponent(ref)}`);
      const eligible = visible.filter(f => (f.size ?? 0) <= 80000 && !/(\.lock$|lock\.json$|\.min\.|\.svg$|\.csv$|\.ipynb$|(^|\/)\.env|credentials|secrets?\.)/i.test(f.path));
      const readme = eligible.find(f => /(^|\/)readme(?:\.(md|rst|txt))?$/i.test(f.path));
      const configs = eligible.filter(f => /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|Dockerfile|docker-compose\.ya?ml)$|\.github\/workflows\/.*\.ya?ml$|\.tf$/i.test(f.path));
      const sourceFiles = eligible.filter(f => /\.(tsx?|jsx?|py|go|rs|java|sql|cs|rb|html|css)$/i.test(f.path) && !/\.d\.ts$/.test(f.path));
      const tests = sourceFiles.filter(f => /test|spec/i.test(f.path));
      const implementation = sourceFiles.filter(f => !tests.includes(f)).sort((a,b) => Number(/(app|main|server|pipeline|api|index)/i.test(b.path)) - Number(/(app|main|server|pipeline|api|index)/i.test(a.path)));
      const chosen = [...new Map([...(readme ? [readme] : []), ...configs.slice(0, 2), ...tests.slice(0, 1), ...implementation.slice(0, 2)].map(f => [f.path, f])).values()].slice(0, 6);
      if (!readme) localWarnings.push('No supported README was found in the inspected file structure.');
      for (let offset = 0; offset < chosen.length; offset += 3) {
        const results = await Promise.allSettled(chosen.slice(offset, offset + 3).map(async f => {
          const content = await get<{ content?: string; encoding?: string; type: string }>(`${base}/contents/${f.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
          if (content.type !== 'file' || content.encoding !== 'base64' || !content.content) throw new Error('File unavailable');
          const text = Buffer.from(content.content, 'base64').toString('utf8').slice(0, 7000);
          if (text.includes('\u0000')) throw new Error('Binary file');
          return { f, text };
        }));
        for (const result of results) {
          if (result.status === 'fulfilled') { const { f, text } = result.value; add(f.path, f === readme ? 'readme' : configs.includes(f) ? 'config' : 'source', text, `${repoUrl}/blob/${encodeURIComponent(ref)}/${f.path.split('/').map(encodeURIComponent).join('/')}`); }
          else localWarnings.push('A selected file could not be retrieved; evidence coverage is incomplete.');
        }
      }
    } catch { localWarnings.push('Repository file inspection failed. Available metadata alone is not proof of implementation.'); }
    if (repo.fork) localWarnings.push('Forked repository: personal contribution has not been verified.');
    repositories.push({ ...repo, languages, commit, sources, warnings: localWarnings });
  }
  return { candidate: { login: profile.login, name: profile.name, public_repos: profile.public_repos, html_url: `https://github.com/${profile.login}` }, repositories, scanned: repos.length, warnings };
}
