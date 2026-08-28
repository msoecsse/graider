# Graider Faculty CLI User Guide

This guide is for faculty and course staff who prefer using Graider from
Terminal instead of the desktop app.

The CLI can run the same core RC1 workflow:

- check the course dashboard
- inspect assignment setup
- preview assignment repository setup
- apply assignment repository setup
- preview grading dispatch
- dispatch grading
- check grading status
- generate the faculty report

## What You Need

- A Graider release or a maintained `graider` terminal command.
- GitHub authentication.
- A local course repository folder containing `course.yml` and `terms/`.

The RC1 macOS app bundles the Graider CLI for the desktop app. It does not
install a global `graider` command automatically. If `graider --help` works in
your Terminal, use the shorter commands in this guide. If it does not, you can
run the bundled CLI from the RC1 folder.

From the folder that contains `Graider.app`:

```bash
GRAIDER_APP="$PWD/Graider.app"

graider() {
  ELECTRON_RUN_AS_NODE=1 "$GRAIDER_APP/Contents/MacOS/Graider" "$GRAIDER_APP/Contents/Resources/app.asar.unpacked/dist-graider-cli/index.js" "$@"
}

graider --help
```

If macOS prints an unsigned-app warning but the help text appears, the CLI
launcher is working.

## GitHub Authentication

Run GitHub CLI login once:

```bash
gh auth login
gh auth status
```

For terminal CLI use, expose the GitHub CLI token to Graider in the same
Terminal session:

```bash
export GRAIDER_GITHUB_TOKEN="$(gh auth token)"
```

Graider does not store GitHub tokens. Private GitHub web links may still require
signing into GitHub in your browser with the same account.

## Course Folder

Run Graider commands from the course repository root, the folder containing:

```text
course.yml
terms/
```

Example:

```bash
cd /path/to/course-repository
```

Paths with spaces are supported. Quote them in shell commands:

```bash
cd "/Users/name/Box Sync/course-repository"
```

## Read-Only And Mutating Commands

Read-only or preview commands:

```text
graider dashboard --json
graider assignment detail <assignment.yml> --json
graider assignment apply-preview <assignment.yml> --json
graider assignment grade-preview <assignment.yml> --json
graider assignment grade-status <assignment.yml> --json
```

`graider report <assignment.yml>` generates or refreshes local report files. It
does not publish student reports unless you pass `--publish-student-reports`,
which is outside this RC1 faculty guide.

Mutating commands:

```text
graider assignment apply <assignment.yml> --yes
graider assignment grade <assignment.yml> --yes --all
```

`assignment apply` may change GitHub/course repository setup and local generated
state. `assignment grade` starts GitHub Actions workflows. Use the preview
commands first and run mutating commands only on the intended course or a safe
sandbox.

## Output

Some RC1 workflow commands are JSON-only and require `--json`:

```text
dashboard
assignment detail
assignment apply-preview
assignment grade-preview
assignment grade-status
```

`assignment apply`, `assignment grade`, and `report` can print normal terminal
output. Use `--json` when you want structured output for debugging or saving to
a file.

Example:

```bash
graider assignment grade-status terms/27s1/assignments/lab02/assignment.yml --json > grade-status.json
```

## Recommended Workflow

Set the assignment path once:

```bash
ASSIGNMENT="terms/27s1/assignments/lab02/assignment.yml"
```

Check the dashboard:

```bash
graider dashboard --json
```

Inspect the assignment:

```bash
graider assignment detail "$ASSIGNMENT" --json
```

Preview and apply repository setup:

```bash
graider assignment apply-preview "$ASSIGNMENT" --json
graider assignment apply "$ASSIGNMENT" --json --yes
```

Preview and dispatch grading:

```bash
graider assignment grade-preview "$ASSIGNMENT" --json
graider assignment grade "$ASSIGNMENT" --json --yes --all
```

Check grading status:

```bash
graider assignment grade-status "$ASSIGNMENT" --json
```

Generate the faculty report:

```bash
graider report "$ASSIGNMENT" --json
```

## Incremental Grade Status

Use student filters to re-check only students whose grading runs are not
complete:

```bash
graider assignment grade-status "$ASSIGNMENT" --student s1234567 --json
graider assignment grade-status "$ASSIGNMENT" --students s1234567,s2345678 --json
```

Use roster `student_id` values, not GitHub usernames, for these filters.

## Targeted Grade Dispatch

The all-students dispatch command is:

```bash
graider assignment grade "$ASSIGNMENT" --json --yes --all
```

You can target a smaller set:

```bash
graider assignment grade "$ASSIGNMENT" --json --yes --section 001
graider assignment grade "$ASSIGNMENT" --json --yes --student-id s1234567
graider assignment grade "$ASSIGNMENT" --json --yes --github-username octocat
```

## Troubleshooting

| Issue                                     | Practical fixes                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `graider: command not found`              | Use the RC1 shell function above, or ask your release maintainer whether a `graider` launcher was installed.                           |
| Not authenticated with GitHub             | Run `gh auth login`, confirm `gh auth status`, then run `export GRAIDER_GITHUB_TOKEN="$(gh auth token)"` in the same Terminal session. |
| Course folder invalid                     | Run commands from the folder containing `course.yml` and `terms/`. Check YAML syntax and required files.                               |
| Assignment file path wrong                | Confirm the path looks like `terms/<term>/assignments/<assignment>/assignment.yml` and exists from the course root.                    |
| GitHub repository missing or inaccessible | Confirm the organization/repository names in YAML and that your GitHub account has access.                                             |
| Workflow missing                          | Check the assignment or course `grading.workflow` path and make sure that workflow exists in the target repositories.                  |
| Grading status incomplete                 | Wait for GitHub Actions to finish, then rerun `assignment grade-status`. Use `--student` or `--students` for active runs.              |
| Report says results are missing           | Return to grade status, confirm runs completed, and check the configured artifact and result file names.                               |
| Private GitHub link opens as 404          | Sign into GitHub in your browser with the same account used for `gh auth login`.                                                       |

## Deferred In RC1

Student report publishing is outside this RC1 faculty CLI guide, even though the
lower-level CLI has a publishing flag. Workflow generation UI is deferred.
