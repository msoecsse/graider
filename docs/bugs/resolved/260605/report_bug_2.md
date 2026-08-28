# Graider Bug Report

Please fill out as much as you can. It is okay to leave a section blank if you do not know.

---

## 1. Short Summary

What went wrong?

```text
Graider report finds the grading-results artifact, but still reports missing_result_file even though the artifact zip contains the expected grading-results.json file.
```

---

## 2. What Were You Trying To Do?

What command, workflow, or task were you trying to complete?

```text
I was testing Graider against a live GitHub sandbox organization to verify that faculty reports can read grading results from a real GitHub Actions artifact.
```

---

## 3. What Did You Expect To Happen?

Describe what you expected Graider to do.

```text
I expected Graider to download the grading-results artifact, find grading-results.json inside it, parse the file, and report a valid grading result for the active student repository.

Expected report state:

artifact_status: found
result_file_status: valid
result_status: passed or failed
```

---

## 4. What Actually Happened?

Describe what Graider did instead.

```text
Graider finds the artifact but reports that the result file is missing.

Actual report state:

artifact_status: found
result_file_status: missing
result_status: missing_result_file

Manual inspection of the GitHub Actions artifact zip shows that the expected results file is present and matches the configured result_file path.
```

---

## 5. Steps To Reproduce

List the steps that caused the problem.

```text
1. Build Graider locally.
2. Set GRAIDER_GITHUB_TOKEN in the terminal.
3. Use the csc1120 sandbox course-admin repository.
4. Confirm the active student repository exists:
   graider-sandbox/27s1-csc1120-lab01-octocat
5. Confirm the grading workflow dispatches successfully.
6. Confirm the GitHub Actions workflow completes.
7. Confirm the workflow uploads an artifact named grading-results.
8. Download the artifact zip manually.
9. Confirm the artifact zip contains the configured result file, grading-results.json.
10. Run Graider report for lab01.
11. Observe that Graider reports missing_result_file.
```

Command used, if applicable:

```bash
node /Users/sean/Box\ Sync/WebstormProjects/Graider/dist/index.js report terms/27s1/assignments/lab01/assignment.yml --json
```

Manual artifact inspection command, if applicable:

```bash
curl -L \
  -H "Authorization: Bearer $GRAIDER_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -o grading-results.zip \
  "<archive_download_url>"

unzip -l grading-results.zip
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
grading-results.zip
grading-results.json
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
Workflow path: .github/workflows/grade.yml
Artifact name: grading-results
Expected result file: grading-results.json

Manual artifact zip inspection confirms that grading-results.json exists inside the downloaded artifact.
```

---

## 7. Output, Error Message, or Logs

Paste the exact output or error message.

```text
From faculty-summary.json:

"artifact_status": "found",
"result_file_status": "missing",
"result_status": "missing_result_file",
"workflow_status": "completed"
```

Full relevant report excerpt:

```json
{
  "github_username": "octocat",
  "grading": {
    "artifact_status": "found",
    "checks": [],
    "commit_sha": "46ddda06c0d994954dd6a4d09b4d6bc27d313f85",
    "result_file_status": "missing",
    "result_status": "missing_result_file",
    "workflow_run_id": 26963833225,
    "workflow_status": "completed"
  },
  "repository_name": "27s1-csc1120-lab01-octocat",
  "repository_status": "available",
  "repository_url": "https://github.com/graider-sandbox/27s1-csc1120-lab01-octocat",
  "roster_status": "active",
  "section": "001",
  "student_id": "s1234567"
}
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
This blocks live faculty grading reports because Graider can find the artifact but cannot read the result file from it.
```
