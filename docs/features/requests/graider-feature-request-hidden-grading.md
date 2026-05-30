# Graider Feature Request Example — Hidden Grading

This file contains both the completed faculty-facing feature request and the developer feature addendum.

---

# Graider Feature Request — Hidden Grading

## 1. Short Summary

What feature or improvement are you requesting?

```text
Add support for hidden grading so faculty can run grading workflows and collect results without immediately exposing detailed grading feedback to students.
```

Example:

```text
Allow faculty to run grading privately before publishing student reports.
```

---

## 2. Problem or Need

What problem would this solve? What is difficult, slow, confusing, or missing right now?

```text
Some grading workflows should be reviewed by faculty or graders before results are visible to students. Today, report publishing is explicit, but there is not a formal hidden grading mode that separates private grading results from published student feedback.
```

Example:

```text
I want to run autograding, review the results, make adjustments if needed, and only then publish feedback to students.
```

---

## 3. Desired Behavior

Describe what you would like Graider to do.

```text
I would like assignment configuration to support a mode where grading results are collected for faculty reports but not published to student repositories until explicitly released.
```

Example:

```text
Run grade and report privately, then later publish student reports after review.
```

---

## 4. Current Workaround

How are you handling this today, if at all?

```text
Faculty avoid using report publishing until results are ready, but the behavior is not represented clearly in assignment configuration or reports.
```

Example:

```text
I run local reports only and avoid --publish-student-reports until I have reviewed the results.
```

---

## 5. Example Command, Workflow, or Screen

If you have an example of how you imagine this working, write it here.

Example command, if applicable:

```bash
graider report terms/27s1/assignments/lab04/assignment.yml
graider report terms/27s1/assignments/lab04/assignment.yml --publish-student-reports
```

Example workflow:

```text
1. Configure assignment grading visibility as hidden/private.
2. Run grade.
3. Run report locally for faculty review.
4. Do not publish student reports until ready.
5. Explicitly publish student reports when feedback should be released.
```

---

## 6. Relevant Files or Inputs

List or attach any files that seem related.

Examples:

```text
assignment.yml
faculty-summary.json
student report
grading-results.json
```

Affected assignment file, if known:

```text
terms/27s1/assignments/lab04/assignment.yml
```

Relevant snippet, if helpful:

```text
grading.visibility: hidden
```

---

## 7. Expected Output or Result

What should the output look like?

```text
Faculty reports should show grading results. Student reports should not be published unless explicitly requested and allowed by the assignment visibility/release state.
```

If this feature creates or changes a file, describe the expected file.

```text
assignment.yml may need a grading visibility/release setting. Reports may need to clearly indicate whether results are hidden or released.
```

---

## 8. Who Benefits?

Who would use this feature?

```text
[x] Faculty
[x] Graders
[x] Course coordinators
[x] Students
[ ] Other:
```

Optional notes:

```text
Students benefit because faculty can review feedback before releasing it.
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
This is important when grading results require review before release.
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
Useful before using Graider in courses where autograding feedback should not be automatically visible.
```

---

# Graider Developer Feature Addendum — Hidden Grading

## A. Feature Classification

**Priority:**

```text
medium
```

**Feature type:**

```text
grading / reporting / publishing / config / privacy
```

**Affected command or area:**

```text
grade / report / report publishing / assignment config
```

**MVP status:**

```text
needs discussion before implementation
```

---

## B. Proposed Behavior

Describe the intended behavior precisely.

```text
Add a formal grading visibility/release model so grading can be collected for faculty review without being published to student repositories until explicitly released. The initial implementation should probably enforce publish gating rather than changing how GitHub Actions run.
```

User-facing command or workflow, if applicable:

```bash
graider grade terms/27s1/assignments/lab04/assignment.yml --all
graider report terms/27s1/assignments/lab04/assignment.yml
graider report terms/27s1/assignments/lab04/assignment.yml --publish-student-reports
```

Generated files or outputs, if applicable:

```text
faculty reports should include grading results
student published reports should be blocked/skipped unless grading visibility/release rules allow publishing
```

---

## C. Requirements and Acceptance Criteria

Functional requirements:

```text
- [ ] Assignment config supports a grading visibility or release setting.
- [ ] Faculty reports can include hidden/private grading results.
- [ ] Local student reports can be generated according to the chosen visibility policy.
- [ ] Publishing student reports is blocked or gated when grading is hidden.
- [ ] Publishing requires explicit release or an explicit override if allowed.
- [ ] Report output clearly indicates hidden vs released grading state.
- [ ] Hidden grading must not expose detailed feedback to student repositories.
```

Nonfunctional requirements:

```text
- [ ] Hidden grading must preserve student privacy.
- [ ] Hidden grading must be explicit and auditable.
- [ ] Hidden grading must not change grade workflow dispatch behavior unless specifically scoped.
- [ ] Hidden grading must preserve existing report behavior for assignments without the new setting.
- [ ] Tests must use local fixtures and FakeGitHubClient.
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
- [ ] Attempting to publish hidden grading results without release produces a structured diagnostic.
- [ ] Faculty reports still show enough data for review.
```

---

## D. Suspected Implementation Area

Likely files or modules:

```text
src/config/config-schemas.ts
src/config/config-models.ts
src/grading/
src/reporting/report-collector.ts
src/reporting/student-report-publisher.ts
src/cli/commands/report.command.ts
src/diagnostics/error-catalog.ts
docs/
```

Relevant existing tests:

```text
tests/unit/config/
tests/reporting/
tests/cli/report-publish.test.ts
tests/unit/grading/
```

New tests likely needed:

```text
tests/cli/report-hidden-grading.test.ts
tests/unit/config/grading-visibility.test.ts
tests/reporting/hidden-grading.test.ts
```

---

## E. Safety and Privacy Constraints

Check all that apply:

```text
[x] Must not make live GitHub calls
[x] Must use FakeGitHubClient in tests
[x] Must not mutate repositories except explicit student report publishing when allowed
[x] Must not publish student reports when hidden/restricted
[x] Must not expose student data
[x] Must not print or store secrets
[x] Must not change generated file schemas unless required
[x] Must preserve backward compatibility
[x] Must keep archive/remove-access unsupported
[x] Must be additive and safe to rerun
```

Additional safety notes:

```text
This feature is privacy-sensitive. It should default toward not publishing student-visible feedback when the visibility/release state is ambiguous.
```

---

## F. Scope Boundaries

The feature may change:

```text
assignment config schema, grading/reporting visibility model, report publishing gating, diagnostics, documentation, tests.
```

The feature must not change:

```text
repository creation, apply behavior, GitHub permissions, workflow dispatch behavior unless separately scoped.
```

Out of scope:

```text
secret/hidden GitHub Actions logs, LMS grade hiding, per-check release controls, manual score editing, student portal functionality.
```

---

## G. Design Notes for Codex

Implementation hints, architecture notes, or preferred approach:

```text
This needs a design discussion before implementation. A safe first version could add a grading visibility field and block report publishing when visibility is hidden unless a separate explicit release flag/config is present. Avoid changing how grading workflows run.
```

Potential edge cases:

```text
- Existing assignments without visibility field
- Grading disabled assignments
- Hidden grading with report --publish-student-reports
- Faculty local reports
- Student local reports
- Partial publish attempts
```

Potential migration or compatibility concerns:

```text
Config schema changes may be needed. Existing assignments should continue to validate with default behavior.
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
Documentation must clearly explain the distinction between grading, local reports, and publishing student-visible feedback.
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
- [ ] Stop if the visibility/release model is not specified clearly enough.
- [ ] Stop if the requested behavior requires hiding GitHub Actions results themselves rather than controlling Graider report publishing.
```

---

## J. Notes for Codex

Additional implementation context:

```text
This request should probably become a short design slice before implementation. The initial safe target is publish gating, not invisible GitHub Actions execution.
```
