# Graider Bug Report

Please fill out as much as you can. It is okay to leave a section blank if you do not know.

---

## 1. Short Summary

What went wrong?

```text
report --publish-student-reports does not publish grading/report.md to the student repository. A direct GitHub Contents API check returns 404, which means the file does not exist, but Graider does not create the file.
```

---

## 2. What Were You Trying To Do?

What command, workflow, or task were you trying to complete?

```text
I was testing Graider's live student report publishing flow after confirming that validate, apply, grade, and local report generation work with a real GitHub sandbox organization.
```

---

## 3. What Did You Expect To Happen?

Describe what you expected Graider to do.

```text
I expected Graider to publish the generated student report back to the active student's repository.

For the active student repository:

graider-sandbox/27s1-csc1120-lab01-octocat

I expected Graider to create or update:

grading/report.md

and possibly any configured companion result file, such as:

grading/results.json

If the file did not already exist, Graider should create it.
```

---

## 4. What Actually Happened?

Describe what Graider did instead.

```text
No student report file was published to the student repository.

A direct GitHub Contents API check for grading/report.md returns 404, confirming that the file does not currently exist in the repository.

Graider previously also emitted warnings such as student_report_repository_missing even though the repository itself exists and can be accessed directly.
```

---

## 5. Steps To Reproduce

List the steps that caused the problem.

```text
1. Build Graider locally.
2. Set GRAIDER_GITHUB_TOKEN in the terminal.
3. Confirm the sandbox student repository exists:
   graider-sandbox/27s1-csc1120-lab01-octocat
4. Confirm validate succeeds.
5. Confirm apply succeeds and preserves the existing repository.
6. Confirm grade dispatches successfully.
7. Confirm the GitHub Actions workflow completes.
8. Confirm report reads the grading artifact and produces valid local faculty/student report output.
9. Run report with --publish-student-reports.
10. Check the student repository for grading/report.md.
11. Verify with the GitHub Contents API that grading/report.md returns 404.
```

Command used, if applicable:

```bash
node /Users/sean/Box\ Sync/WebstormProjects/Graider/dist/index.js report terms/27s1/assignments/lab01/assignment.yml --publish-student-reports --verbose --json
```

Manual verification command:

```bash
curl -i \
  -H "Authorization: Bearer $GRAIDER_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/graider-sandbox/27s1-csc1120-lab01-octocat/contents/grading%2Freport.md
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
faculty-summary.json
student report
```

Affected assignment file, if known:

```text
terms/27s1/assignments/lab01/assignment.yml
```

Relevant snippet, if helpful:

```text
GitHub organization: graider-sandbox
Admin repo: graider-sandbox/csc1120
Student repo: graider-sandbox/27s1-csc1120-lab01-octocat

Expected published file:

grading/report.md

Direct GitHub Contents API check currently returns 404 for grading/report.md, meaning the file does not exist and should be created by publish.
```

---

## 7. Output, Error Message, or Logs

Paste the exact output or error message.

```text
GET /repos/graider-sandbox/27s1-csc1120-lab01-octocat/contents/grading%2Freport.md - 504 with id UNKNOWN

report: terms/27s1/assignments/lab01/assignment.yml: failure

warnings:
student_report_repository_missing: Student report was not published because the student repository is unavailable.
```

Additional observed behavior:

```text
A later direct curl check against:

https://api.github.com/repos/graider-sandbox/27s1-csc1120-lab01-octocat/contents/grading%2Freport.md

returns 404, confirming the repository exists but the target report file does not exist.

A 404 for the contents path should mean "file missing; create it", not "student repository missing".
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
This blocks end-to-end MVP verification because Graider can generate correct local reports, but cannot yet publish student-visible reports back to real student repositories.
```
