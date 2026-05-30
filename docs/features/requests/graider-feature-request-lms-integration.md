# Graider Feature Request Example — LMS Integration

This file contains both the completed faculty-facing feature request and the developer feature addendum.

---

# Graider Feature Request — LMS Integration

## 1. Short Summary

What feature or improvement are you requesting?

```text
Add LMS integration so Graider can connect assignment/reporting data with the course LMS instead of requiring manual copying.
```

Example:

```text
Allow Graider to export or sync grades to the LMS.
```

---

## 2. Problem or Need

What problem would this solve? What is difficult, slow, confusing, or missing right now?

```text
Graider can generate reports, but faculty still need to manually transfer grades or status information into the LMS. This is time-consuming and error-prone, especially for large sections.
```

Example:

```text
After generating report data, I still have to manually enter grades into the LMS gradebook.
```

---

## 3. Desired Behavior

Describe what you would like Graider to do.

```text
I would like Graider to either export an LMS-ready gradebook file or connect to the LMS to sync grades/statuses for an assignment.
```

Example:

```text
I would like a command that produces a Canvas-ready CSV file or eventually pushes grades to Canvas directly.
```

---

## 4. Current Workaround

How are you handling this today, if at all?

```text
Faculty manually open Graider reports and copy grades or statuses into the LMS.
```

Example:

```text
I export the faculty CSV report, clean it up manually, and upload or copy data into the LMS.
```

---

## 5. Example Command, Workflow, or Screen

If you have an example of how you imagine this working, write it here.

Example command, if applicable:

```bash
graider lms-export terms/27s1/assignments/lab04/assignment.yml --format canvas-csv
```

Example workflow:

```text
1. Run graider report.
2. Run an LMS export command.
3. Upload the generated CSV into the LMS.
4. Verify grades/statuses in the LMS.
```

---

## 6. Relevant Files or Inputs

List or attach any files that seem related.

Examples:

```text
faculty-summary.csv
faculty-summary.json
assignment.yml
roster CSV
LMS assignment ID
```

Affected assignment file, if known:

```text
terms/27s1/assignments/lab04/assignment.yml
```

Relevant snippet, if helpful:

```text
metadata.lms_assignment_id: <assignment id>
```

---

## 7. Expected Output or Result

What should the output look like?

```text
At minimum, Graider should generate an LMS-compatible export file that faculty can review before uploading. A later version could sync directly through the LMS API.
```

If this feature creates or changes a file, describe the expected file.

```text
terms/<term-code>/reports/<assignment-slug>/lms-export.csv
```

---

## 8. Who Benefits?

Who would use this feature?

```text
[x] Faculty
[x] Graders
[x] Course coordinators
[ ] Students
[ ] Other:
```

Optional notes:

```text
Students benefit indirectly through faster and more accurate grade posting.
```

---

## 9. Importance

Choose one:

```text
[ ] Needed for course operations
[x] Very useful soon
[ ] Nice improvement
[ ] Idea for later
```

Optional notes:

```text
The manual grade transfer step is one of the most likely places for mistakes after reporting works.
```

---

## 10. Timing

When would this be useful?

```text
[ ] Immediately
[x] This term
[x] Before the next offering
[ ] No specific deadline
```

Optional notes:

```text
An export-only version would be useful before direct LMS API integration.
```

---

# Graider Developer Feature Addendum — LMS Integration

## A. Feature Classification

**Priority:**

```text
medium
```

**Feature type:**

```text
report / export / LMS integration / gradebook workflow
```

**Affected command or area:**

```text
report / new lms-export command / docs / config metadata
```

**MVP status:**

```text
candidate for next release; start with export-only
```

---

## B. Proposed Behavior

Describe the intended behavior precisely.

```text
Implement an LMS integration foundation starting with an export-only workflow. Generate an LMS-ready CSV from the existing faculty summary report data. Direct LMS API sync should not be implemented in the first feature unless separately scoped and approved.
```

User-facing command or workflow, if applicable:

```bash
graider lms-export terms/27s1/assignments/lab04/assignment.yml --format canvas-csv
```

Generated files or outputs, if applicable:

```text
terms/<term-code>/reports/<assignment-slug>/lms-export.csv
```

---

## C. Requirements and Acceptance Criteria

Functional requirements:

```text
- [ ] Generate an LMS-ready CSV from report data.
- [ ] Require existing report/manifest data.
- [ ] Include student identifier compatible with LMS import requirements.
- [ ] Include score or status fields based on Graider report results.
- [ ] Include assignment LMS ID when available.
- [ ] Never push grades directly to LMS in the initial implementation.
- [ ] Produce deterministic output.
- [ ] Support structured JSON output for the export command if a new command is added.
```

Nonfunctional requirements:

```text
- [ ] Export must not expose unnecessary student data.
- [ ] Export must be reviewable before upload.
- [ ] Export must be deterministic.
- [ ] Export must be tested with local fixtures only.
- [ ] No live LMS API calls in normal tests.
```

Acceptance criteria:

```text
- [ ] The feature is covered by tests.
- [ ] Existing behavior is preserved.
- [ ] JSON/YAML fixtures remain valid.
- [ ] npm run typecheck passes.
- [ ] npm run lint passes.
- [ ] npm run format:check passes.
- [ ] npm test passes.
- [ ] npm run build passes.
```

Additional acceptance criteria:

```text
- [ ] Documentation clearly states this is export-only, not direct LMS sync.
- [ ] Export output can be reviewed before being uploaded.
```

---

## D. Suspected Implementation Area

Likely files or modules:

```text
src/reporting/report-collector.ts
src/reporting/faculty-csv-renderer.ts
src/lms/lms-export-models.ts
src/lms/lms-export-renderer.ts
src/cli/commands/lms-export.command.ts
src/diagnostics/error-catalog.ts
docs/
```

Relevant existing tests:

```text
tests/cli/report.test.ts
tests/reporting/
tests/fixtures/report/
```

New tests likely needed:

```text
tests/cli/lms-export.test.ts
tests/unit/lms/lms-export-renderer.test.ts
tests/fixtures/lms-export/
```

---

## E. Safety and Privacy Constraints

Check all that apply:

```text
[x] Must not make live GitHub calls
[x] Must use FakeGitHubClient in tests
[x] Must not mutate repositories
[x] Must not publish student reports
[x] Must not expose unnecessary student data
[x] Must not print or store secrets
[x] Must not change generated file schemas unless required
[x] Must preserve backward compatibility
[x] Must keep archive/remove-access unsupported
[x] Must be additive and safe to rerun
```

Additional safety notes:

```text
Initial version should be export-only. Direct LMS API sync needs a separate design discussion because it introduces credentials, grade mutation, and institutional policy concerns.
```

---

## F. Scope Boundaries

The feature may change:

```text
report/export modules, new LMS export module, new command registration, documentation, examples, diagnostics, tests.
```

The feature must not change:

```text
apply, grade, GitHub permissions, student report publishing, archive/remove-access behavior.
```

Out of scope:

```text
Direct LMS API writes, OAuth/token storage, automatic grade posting, multi-LMS abstraction, LMS roster reconciliation.
```

---

## G. Design Notes for Codex

Implementation hints, architecture notes, or preferred approach:

```text
Start with a local export file generated from existing report data. Do not connect to Canvas/Blackboard/D2L APIs yet. Keep the model generic enough that Canvas CSV can be the first supported format.
```

Potential edge cases:

```text
- Missing LMS assignment ID
- Student in Graider roster but not LMS
- Missing score
- Grading disabled
- Failed grading result
- Dropped/hold students
```

Potential migration or compatibility concerns:

```text
No schema changes should be required for export-only if metadata.lms_assignment_id already exists.
```

---

## H. Documentation Updates Needed

Check all that apply:

```text
[x] README
[ ] docs/runtime.md
[x] docs/generated-files.md
[x] docs/error-warning-catalog.md
[ ] docs/github-token-permissions.md
[x] docs/troubleshooting.md
[x] docs/examples
[ ] No documentation update expected
```

Specific docs notes:

```text
Document that initial LMS integration is export-only and requires faculty review before upload.
```

---

## I. Stop Conditions for Codex

Codex should stop and report instead of implementing if:

```text
[x] The requested feature conflicts with existing requirements.
[x] The feature requires live GitHub access to design safely.
[x] The feature would require destructive repository behavior.
[x] The feature would expose private student data.
[x] The feature is larger than one focused change.
[x] The feature requires schema changes that are not specified.
```

Additional stop conditions:

```text
- [ ] Stop if direct LMS API integration is required by the request.
- [ ] Stop if target LMS import format is unspecified and cannot be inferred safely.
```

---

## J. Notes for Codex

Additional implementation context:

```text
This should likely be split into export-only first, then direct LMS API sync later if needed. The faculty request may say LMS integration broadly, but the first safe implementation should be a reviewable export.
```
