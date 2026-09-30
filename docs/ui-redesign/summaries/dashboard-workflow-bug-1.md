# DASHBOARD-WORKFLOW-BUG-1

## User-visible reproduction

An assignment configured with the `java-junit-checkstyle` managed preset was
shown as **Needs attention** when its template intentionally omitted
`.github/workflows/grade.yml`. Apply still succeeded and deployed Graider's
canonical workflow to student repositories, but Dashboard emitted
`dashboard_grading_workflow_missing` against the template.

## Root cause

Dashboard resolved effective grading for its public summary, but retained only
the enabled flag, mode, and workflow path. Its later GitHub readiness pass then
read every enabled workflow path from the template repository. It did not have
the resolved preset needed by the shared managed-ownership predicate and could
not distinguish Graider-managed grading from a faculty-owned workflow.

## Managed preset readiness

The internal loaded-assignment state now retains the already-resolved effective
grading configuration. Dashboard calls
`isManagedGradingWorkflowEligible(grading)`, which continues to require all of:

- `enabled: true`
- `mode: preset`
- `preset: java-junit-checkstyle`

For eligible managed presets, Dashboard does not request the configured
workflow from the template. A missing, stale, malformed, or otherwise
irrelevant template copy cannot create a workflow diagnostic. Dashboard remains
read-only; Apply remains responsible for deploying the canonical workflow to
student repositories.

## Custom workflow readiness

Custom/faculty workflows retain the existing template-file contract. Dashboard
reads the exact configured path from the configured template branch, reports
`dashboard_grading_workflow_missing` when absent, parses present workflows, and
reports `dashboard_workflow_dispatch_missing` when the dispatch trigger is
absent. A custom workflow at `.github/workflows/grade.yml` remains custom; the
filename does not imply Graider ownership. Existing GitHub request, auth,
permission, and rate-limit diagnostics are unchanged.

## Effective grading inheritance

Managed ownership is evaluated from resolved effective grading, so both a
course-level managed preset inherited by an assignment and an explicit
assignment-level managed override receive the same readiness behavior.

## Dashboard status semantics

Template-backed assignments still require an available template repository and
configured branch. After those checks pass, managed presets report:

```text
templateRepository: available
templateBranch: available
gradingWorkflow: not_required
workflowDispatch: not_required
```

No public Dashboard model or schema field was added. No-grading assignments
continue to use `not_required` for both workflow statuses.

## Tests

Dashboard CLI coverage proves that assignment-level and course-inherited
managed presets remain healthy without a template workflow, do not make a
workflow-file request, and ignore a stale malformed template copy. Existing
coverage preserves no-grading behavior, custom missing-workflow diagnostics,
custom missing-dispatch diagnostics, healthy custom workflows, and Dashboard's
read-only contract. An explicit custom workflow using the canonical managed
filename proves that path matching does not determine ownership. The focused
Dashboard renderer suite remains green without fixture or renderer changes;
genuine custom-workflow diagnostics remain displayable.

## Validation

Focused backend validation passed 33 tests across 3 files. Focused Dashboard
renderer validation passed 50 tests in 1 file.

| Command                            | Result                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                | Passed                                                                                                                                           |
| `npm run lint`                     | Passed                                                                                                                                           |
| `npm run format:check`             | Passed                                                                                                                                           |
| `npm test`                         | Passed — 1,109 passed and 1 skipped across 122 files                                                                                             |
| `npm run build`                    | Passed                                                                                                                                           |
| `npm run audit`                    | Passed the configured high-severity gate; npm reported 1 low and 2 moderate development-tool advisories in Vitest/`@vitest/mocker` and `esbuild` |
| `npm --prefix ui run typecheck`    | Passed                                                                                                                                           |
| `npm --prefix ui run format:check` | Passed                                                                                                                                           |
| `npm --prefix ui test`             | Passed — 1,112 passed across 146 files                                                                                                           |
| `npm --prefix ui run build`        | Passed with Vite's existing large-chunk advisory                                                                                                 |

## Backlog

ITEM-49 is resolved. ITEM-36 was not started.

## Manual retest

The live tests recorded in the workflow and Apply summaries did not include a
Dashboard-specific observation, so this summary does not claim that the
Dashboard acceptance case was observed live. A future safe refresh can verify:

1. Configure an assignment with the enabled `java-junit-checkstyle` preset and
   the canonical workflow, artifact, and result-file paths.
2. Ensure its template branch does not contain `.github/workflows/grade.yml`.
3. Refresh Dashboard and confirm the assignment is not **Needs attention** and
   has neither managed-workflow-missing nor dispatch-missing diagnostics.
4. Confirm Assignment Detail and existing student repositories are unchanged.
5. Check a `custom-workflow` assignment with a missing workflow and confirm it
   remains **Needs attention** with `dashboard_grading_workflow_missing`.

## Non-goals

This fix does not change canonical workflow content, ownership version, Apply
deployment, workflow repair, grading evidence, student or template
repositories, Assignment Detail behavior, ITEM-47 creation behavior, ITEM-48
Apply results, WORKFLOW-FX-1, Dashboard visuals, or ITEM-36.

## Next step

Verify the managed-preset Dashboard acceptance case opportunistically on a
future safe refresh. The separate Apply and WORKFLOW-FX-1/2 live results are
recorded in their own summaries; ITEM-36 remains the next planned engineering
slice.
