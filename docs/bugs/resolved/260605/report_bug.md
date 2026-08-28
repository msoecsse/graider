# Graider Bug Report

Please fill out as much as you can. It is okay to leave a section blank if you do not know.

---

## 1. Short Summary

What went wrong?

```text
The grade command fails to dispatch a GitHub Actions workflow with HTTP 422, even though manually dispatching the same workflow through the GitHub API succeeds with HTTP 204.
```

---

## 2. What Were You Trying To Do?

What command, workflow, or task were you trying to complete?

```text
I was testing Graider against a live GitHub sandbox organization to verify that the grade command can dispatch the configured grading workflow in a real student repository.
```

---

## 3. What Did You Expect To Happen?

Describe what you expected Graider to do.

```text
I expected Graider to dispatch the configured workflow for the active student repository:

graider-sandbox/27s1-csc1120-lab01-octocat

The workflow file exists at:

.github/workflows/grade.yml

The workflow includes workflow_dispatch, and a direct GitHub API dispatch request succeeds with HTTP 204.
```

---

## 4. What Actually Happened?

Describe what Graider did instead.

```text
Graider attempted to dispatch the workflow but GitHub returned HTTP 422.

The grade command failed with workflow_dispatch_failed and github_api_error.

Manual dispatch using curl against the same repository and workflow succeeds with HTTP 204, which indicates the workflow itself is dispatchable.
```

---

## 5. Steps To Reproduce

List the steps that caused the problem.

```text
1. Build Graider locally.
2. Set GRAIDER_GITHUB_TOKEN in the terminal.
3. Confirm the sandbox student repository exists:
   graider-sandbox/27s1-csc1120-lab01-octocat
4. Confirm the student repository has .github/workflows/grade.yml.
5. Confirm grade.yml includes workflow_dispatch.
6. Confirm manual dispatch with curl returns HTTP 204.
7. Run Graider grade for lab01.
8. Observe that Graider fails with HTTP 422.
```

Command used, if applicable:

```bash
node /Users/sean/Box\ Sync/WebstormProjects/Graider/dist/index.js grade terms/27s1/assignments/lab01/assignment.yml --all --json
```

Manual dispatch command that succeeds:

```bash
curl -i -X POST \
  -H "Authorization: Bearer $GRAIDER_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/graider-sandbox/27s1-csc1120-lab01-octocat/actions/workflows/grade.yml/dispatches \
  -d '{"ref":"main"}'
```

Where were you when you ran the command?

```text
From the local csc1120 course-admin repository root.
```

---

## 6. Relevant Files or Inputs

List or attach any files that seem related.

Examples:

```text
course.yml
term.yml
assignment.yml
manifest.yml
roster CSV
.github/workflows/grade.yml
```

Affected assignment file, if known:

```text
terms/27s1/assignments/lab01/assignment.yml
```

Relevant snippet, if helpful:

```text
Student repository:

graider-sandbox/27s1-csc1120-lab01-octocat

Workflow path:

.github/workflows/grade.yml

Workflow dispatch endpoint used manually:

https://api.github.com/repos/graider-sandbox/27s1-csc1120-lab01-octocat/actions/workflows/grade.yml/dispatches

Manual dispatch payload that succeeds:

{"ref":"main"}
```

---

## 7. Output, Error Message, or Logs

Paste the exact output or error message.

```text
POST /repos/graider-sandbox/27s1-csc1120-lab01-octocat/actions/workflows/grade.yml/dispatches - 422

grade: terms/27s1/assignments/lab01/assignment.yml: failure
errors: workflow_dispatch_failed: Workflow dispatch failed for a selected student repository.; github_api_error: Workflow dispatch failed for a selected student repository.
```

Additional observed behavior:

```text
Manual curl dispatch against the same endpoint succeeds with HTTP 204 when using this payload:

{"ref":"main"}

This suggests Graider's GitHubClient.dispatchWorkflow implementation is likely missing the required ref value or sending the wrong ref/workflow identifier.
```

Do not include GitHub tokens, passwords, or secrets.

If student data appears in the output, remove or anonymize anything that is not needed to reproduce the problem.

---

## 8. Urgency

Choose one:

```text
[x] Blocking course work right now
[ ] Needs to be fixed soon
[ ] Annoying but there is a workaround
[ ] Minor issue
```

Optional notes:

```text
This blocks live grading workflow validation and prevents faculty from using Graider to trigger grading runs in real student repositories.
```
