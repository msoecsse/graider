# ASSIGNMENT-CREATE-BUG-1

## Summary

New grading-enabled assignment and course setup output now declares the
existing `java-junit-checkstyle` managed preset explicitly. Assignment Detail
also treats pre-Apply template sync as not yet applicable, refreshes applied
state consistently, and avoids blaming roster counts when the entire detail
load failed on configuration validation.

## Root Causes

The setup serializers wrote the managed workflow, artifact, and result paths
without the ownership-bearing `mode` and `preset`. The strict managed-workflow
predicate therefore classified the output as legacy/custom. Separately,
Assignment Detail prepared template sync on selection regardless of Apply state
and did not rerun that preparation after detail refresh. Its readiness helper
also treated every null roster as a roster-specific failure, including total
assignment-detail failures.

The serializers also emitted empty `required_files:` and `rubric:` mappings as
YAML nulls. Those values do not satisfy the strict assignment schema; empty
optional collections are now omitted.

## Managed Grading Defaults

Assignment Setup now writes this enabled block, followed by configured required
files and rubric categories:

```yaml
grading:
  enabled: true
  mode: preset
  preset: java-junit-checkstyle
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
```

`mode` and `preset` are children of `grading`; neither is written at the YAML
root. Disabled grading retains `enabled: false` and `mode: no-grading`.

## Course Defaults

Course Setup writes the same explicit managed preset in `course.yml` when
grading is enabled. Disabling course grading continues to omit the course
grading block.

## Managed Workflow Readiness

The eligibility predicate remains strict: only `enabled === true`,
`mode === "preset"`, and `preset === "java-junit-checkstyle"` is managed.
Existing Assignment Detail and core GitHub readiness logic skip a template
workflow-file requirement for that explicit configuration because Apply
deploys the canonical workflow. No managed workflow content or ownership
version changed.

## Pre-Apply Template Sync

For `not_applied`, the renderer does not call template-sync preparation, does
not show update controls or a manifest banner, and leaves Apply as the lifecycle
action when readiness permits. `applied` and `partially_applied` prepare
availability normally.

## Refresh Consistency

Refresh clears the previous availability, blocker, modal target, result, and
error before loading current detail. The newly returned Apply state controls
whether preparation runs. Independent generation counters reject late detail
loads and late template-sync preparation results, including responses from an
older refresh or selection.

## Roster Readiness Correction

A null roster produces the roster-summary attention item only when meaningful
non-failure detail exists. A total `failure` keeps its original assignment or
schema diagnostic primary. `partial_success` with genuinely unavailable roster
data continues to surface roster attention, and valid counts do not.

## Legacy/Custom Workflow Safety

No auto-migration was added. Assignment Edit preserves explicit managed fields,
preserves a legacy/custom block with no explicit preset, and does not infer
ownership from `.github/workflows/grade.yml`. Custom workflow file and
`workflow_dispatch` checks remain enforced.

## Tests

Coverage now includes structural setup YAML assertions, empty optional grading
collection handling, explicit managed edit preservation, legacy/no-grading edit
behavior, real config-loader/schema validation, assignment and course-inherited
managed eligibility, managed/custom/no-grading GitHub readiness, pre-Apply and
applied-like template-sync behavior, both refresh transitions, stale-response
protection, and the three roster-readiness cases.

The existing template-sync context test still proves a direct call without a
valid manifest returns `manifest_required`.

## Validation

| Command                                                                                                          | Result                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused setup, edit, readiness, Assignment Detail, GitHub readiness, managed deployment, and template-sync tests | Passed — 145 tests across the focused runs                                                                                                       |
| `npm run typecheck`                                                                                              | Passed                                                                                                                                           |
| `npm run lint`                                                                                                   | Passed                                                                                                                                           |
| `npm run format:check`                                                                                           | Passed                                                                                                                                           |
| `npm test`                                                                                                       | Passed — 1,097 passed, 1 skipped across 122 files                                                                                                |
| `npm run build`                                                                                                  | Passed                                                                                                                                           |
| `npm run audit`                                                                                                  | Passed the configured high-severity gate; npm reported 1 low and 2 moderate development-tool advisories in Vitest/`@vitest/mocker` and `esbuild` |
| `npm --prefix ui run typecheck`                                                                                  | Passed                                                                                                                                           |
| `npm --prefix ui run format:check`                                                                               | Passed                                                                                                                                           |
| `npm --prefix ui test`                                                                                           | Passed on the final full run — 1,096 passed across 146 files                                                                                     |
| `npm --prefix ui run build`                                                                                      | Passed with Vite's existing large-chunk advisory                                                                                                 |

The first full UI run exposed an assertion race in the updated applied-state
blocker test, and a focused confirmation exposed the same missing initial-call
ordering in a single-repository test. The tests now await the actual rendered
state and initial bulk preparation without arbitrary sleeps. The focused suite
and final unmodified full UI command both passed.

## Backlog

ITEM-47 is resolved. ITEM-36 was not started.

## Manual Retest

The generated configuration and lifecycle transitions were exercised through
service, real-loader, and renderer integration tests. A live Electron UI
assignment creation/Apply/refresh retest and a deliberately malformed file
retest were not performed in this noninteractive run and remain required.

## Deferred / Non-goals

No parser convergence, new preset, grading mode selector, legacy migration,
workflow ownership/content change, evidence/result schema change, backend
manifest weakening, fake manifest, or roster-manager redesign is included.

## Next Step

After the manual assignment-creation retest succeeds, return to the two
WORKFLOW-FX-1 live GitHub smoke runs before considering ITEM-36.
