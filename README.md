# RepoSignal

RepoSignal is a small technical-candidate evidence demo.

It takes:

- a GitHub username or profile URL
- a pasted job description

and compares public project evidence against the role's requirements.

The goal is not to score a candidate. It is to answer a narrower question:

> What can this candidate's public GitHub work actually support?

**No public evidence found is not evidence that the candidate lacks a skill.**

---

## Why I built this

Technical hiring often relies heavily on CVs, profiles, and self-reported skills.

Public repositories can provide an additional evidence layer showing what someone has actually built, which technologies they have used, and which projects are relevant to a role.

RepoSignal explores how that signal could complement candidate understanding and job matching.

---

## What it does

RepoSignal:

1. Accepts a GitHub username or profile URL.
2. Extracts candidate-relevant requirements from a job description.
3. Fetches public GitHub repositories.
4. Ranks and selects up to five relevant repositories.
5. Inspects repository metadata, languages, README files, commits, file structure, tests, configuration and selected source files.
6. Maps verified evidence against the job requirements.
7. Shows the supporting evidence and source links.
8. Generates project-specific interview questions.

Evidence is reported as:

- Strong public evidence
- Moderate public evidence
- Limited public evidence
- No public evidence found

RepoSignal does **not** produce an overall candidate score or hiring recommendation.

---

## Example

Input:

```text
GitHub profile:
https://github.com/example-user

Job description:
Senior Data Engineer