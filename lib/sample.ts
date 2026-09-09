import { DISCLAIMER, type Report, type Source, type SelectedRepo } from './evidence';
export const sampleJob = 'We are looking for a backend engineer to build Python REST APIs, design PostgreSQL data models, write automated tests, and maintain CI/CD with GitHub Actions. Experience deploying services on AWS is desirable.';
const sources: Source[] = [
  { id: 's1', repo: 'sample-candidate/task-api', path: 'app/api.py', kind: 'source', url: '', text: 'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/tasks")\ndef list_tasks():\n    return repository.list_tasks()' },
  { id: 's2', repo: 'sample-candidate/task-api', path: 'tests/test_api.py', kind: 'source', url: '', text: 'def test_list_tasks(client):\n    response = client.get("/tasks")\n    assert response.status_code == 200' },
  { id: 's3', repo: 'sample-candidate/task-api', path: 'requirements.txt', kind: 'config', url: '', text: 'fastapi==0.115.0\npsycopg[binary]==3.2.1\npytest==8.3.3' },
  { id: 's4', repo: 'sample-candidate/task-api', path: '.github/workflows/test.yml', kind: 'config', url: '', text: 'name: Tests\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pytest' },
];
const repo: SelectedRepo = { name: 'task-api', full_name: 'sample-candidate/task-api', description: 'Illustrative task-management API with Python and a database adapter.', language: 'Python', topics: ['python','api'], fork: false, archived: false, disabled: false, private: false, size: 100, pushed_at: '2026-08-24T00:00:00Z', default_branch: 'main', stargazers_count: 0, selectionReason: 'Metadata overlaps with Python and API requirements. Selected to inspect implementation and test signals.', matchedKeywords: ['python','api'], sources, warnings: ['Illustrative fixture only. This repository and its snippets are fictional; no GitHub fetch or LLM call was made.'], languages: ['Python'], commit: null };
export const sampleReport: Report = {
  candidate: { login: 'sample-candidate', name: 'Sample candidate', public_repos: 1, html_url: '' }, repositories: [repo], scanned: 1, demo: true, generatedAt: '2026-09-09T00:00:00Z',
  requirements: [
    { id: 'q1', title: 'Python REST APIs', jobQuote: 'build Python REST APIs', keywords: ['python','api'] },
    { id: 'q2', title: 'PostgreSQL data modeling', jobQuote: 'design PostgreSQL data models', keywords: ['postgresql'] },
    { id: 'q3', title: 'Automated testing', jobQuote: 'write automated tests', keywords: ['pytest','testing'] },
    { id: 'q4', title: 'CI/CD with GitHub Actions', jobQuote: 'maintain CI/CD with GitHub Actions', keywords: ['github-actions'] },
    { id: 'q5', title: 'AWS deployment', jobQuote: 'Experience deploying services on AWS is desirable', keywords: ['aws'] },
  ],
  assessments: [
    { requirementId: 'q1', level: 'Strong public evidence', reasoning: 'A Python HTTP endpoint and a corresponding request test provide complementary implementation evidence. This supports a narrow API signal, not production scale or personal authorship.', evidence: [{ sourceId: 's1', quote: '@app.get("/tasks")', relevance: 'Defines a GET endpoint in a Python FastAPI application.', source: sources[0] }, { sourceId: 's2', quote: 'response = client.get("/tasks")', relevance: 'Exercises the endpoint through a test client.', source: sources[1] }] },
    { requirementId: 'q2', level: 'Limited public evidence', reasoning: 'A PostgreSQL client dependency suggests database integration, but no schema or migrations are shown to support data-modeling experience.', evidence: [{ sourceId: 's3', quote: 'psycopg[binary]==3.2.1', relevance: 'PostgreSQL client is declared. A dependency alone does not demonstrate schema design.', source: sources[2] }] },
    { requirementId: 'q3', level: 'Moderate public evidence', reasoning: 'A test asserts an HTTP response. The small sample does not establish coverage, failure-case testing or testing strategy.', evidence: [{ sourceId: 's2', quote: 'assert response.status_code == 200', relevance: 'Checks the successful response of an API endpoint.', source: sources[1] }] },
    { requirementId: 'q4', level: 'Moderate public evidence', reasoning: 'A GitHub Actions workflow invokes tests. This supports CI configuration; delivery automation and successful executions are not shown.', evidence: [{ sourceId: 's4', quote: '- run: pytest', relevance: 'Invokes the test suite in a workflow configuration.', source: sources[3] }] },
    { requirementId: 'q5', level: 'No public evidence found', reasoning: 'No AWS deployment source or configuration appears in this illustrative sample. Other work and uninspected files remain outside this assessment.', evidence: [] },
  ],
  skills: [{ name: 'Python / FastAPI', sourceIds: ['s1'] }, { name: 'API testing', sourceIds: ['s2'] }, { name: 'GitHub Actions', sourceIds: ['s4'] }],
  questions: [{ question: 'What was your contribution to task-api, and how would you extend the endpoint test to cover failures and authorization?', sourceId: 's2', source: sources[1] }, { question: 'The workflow invokes pytest. How would you decide when this service is safe to deploy?', sourceId: 's4', source: sources[3] }],
  summary: `4 of 5 requirements have cited signals in this illustrative sample. API implementation and tests are visible; data modeling and delivery depth need discussion. This is evidence coverage, not a hiring recommendation. ${DISCLAIMER}`,
  warnings: ['Sample report with fictional project snippets. It demonstrates report behavior, not an assessment of a real person.'],
};

// The sample breakdown uses only the fixture's explicit candidate expectations.
sampleReport.jobItems = sampleReport.requirements.map(r => ({ title: r.title, jobQuote: r.jobQuote, keywords: r.keywords, category: r.id === 'q5' ? 'required_technical_skills' : 'responsibilities', subject: 'candidate', reasoning: r.id === 'q5' ? 'Candidate experience is explicitly requested as desirable, not mandatory.' : 'Explicit work requested of the candidate in the sample description.' }));
