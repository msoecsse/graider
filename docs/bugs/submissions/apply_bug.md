# Graider Bug Report

Please fill out as much as you can. It is okay to leave a section blank if you do not know.

---

## 1. Short Summary

What went wrong?

```text
Live apply writes a manifest repository record indicating that a student repository was created, but the repository does not exist in the GitHub organization.
```

---

## 2. What Were You Trying To Do?

What command, workflow, or task were you trying to complete?

```text
I was testing Graider against a live GitHub sandbox organization to verify that apply creates student assignment repositories in GitHub.
```

---

## 3. What Did You Expect To Happen?

Describe what you expected Graider to do.

```text
I expected Graider to create a real private student repository in the graider-sandbox GitHub organization using the configured assignment template repository.

For lab01 and student octocat, I expected a repository like:

graider-sandbox/27s1-csc1120-lab01-octocat

to appear in the GitHub organization after running apply.
```

---

## 4. What Actually Happened?

Describe what Graider did instead.

```text
Graider reported partial_success and generated a manifest file. The manifest indicates that the student repository was created/tracked, but no student repository appears in the graider-sandbox organization.

The organization still only contains the admin repository:

graider-sandbox/csc1120

and the assignment template repository:

graider-sandbox/csc1120L1Template

The expected student repository does not exist in GitHub.
```

---

## 5. Steps To Reproduce

List the steps that caused the problem.

```text
1. Build Graider locally.
2. Set GRAIDER_GITHUB_TOKEN in the terminal.
3. From the local csc1120 course-admin repository, run validate for lab01.
4. Run plan for lab01.
5. Run apply for lab01 with --yes.
6. Check the graider-sandbox GitHub organization for the expected student repository.
7. Check the generated manifest for lab01.
```

Command used, if applicable:

```bash
node /Users/sean/Box\ Sync/WebstormProjects/Graider/dist/index.js validate terms/27s1/assignments/lab01/assignment.yml

node /Users/sean/Box\ Sync/WebstormProjects/Graider/dist/index.js plan terms/27s1/assignments/lab01/assignment.yml

node /Users/sean/Box\ Sync/WebstormProjects/Graider/dist/index.js apply terms/27s1/assignments/lab01/assignment.yml --yes
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
Template repo: graider-sandbox/csc1120L1Template
Expected student repo: graider-sandbox/27s1-csc1120-lab01-octocat

The generated manifest references the expected student repository, but the repository does not exist in GitHub.
```

---

## 7. Output, Error Message, or Logs

Paste the exact output or error message.

```text
apply: terms/27s1/assignments/lab01/assignment.yml: partial_success
generated: terms/27s1/manifests/lab01/manifest.yml
errors: grading_workflow_missing: Grading workflow was not found for 27s1-csc1120-lab01-octocat.; workflow_dispatch_unsupported: Workflow dispatch is not supported for 27s1-csc1120-lab01-octocat.
```

Additional observed behavior:

```text
No student repository was created in the graider-sandbox GitHub organization.

The only repositories visible in the organization are:

graider-sandbox/csc1120
graider-sandbox/csc1120L1Template
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
This blocks live GitHub validation and faculty rollout because apply appears to record repository creation in the manifest without actually creating the repository in GitHub.
```
