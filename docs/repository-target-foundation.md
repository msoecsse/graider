# Repository Target Foundation

## Internal group-target executor

Group configuration, preview, and Apply preflight exist. The dependency-injected
`src/groups/group-target-executor.ts` is tested only with mocked GitHub
dependencies. It performs one
repository operation per group target, never per student; adds deduplicated
members as `admin` collaborators; applies configured faculty/grader teams; and
returns in-memory target identities and URLs for later manifest-v2 construction.
It writes no manifests.

It is fail-fast: repository, collaborator, team, and workflow API failures
stop later targets without cleanup. Workflow found succeeds; a newly-created
repository with an unobservable workflow gets `grading_workflow_pending`; API
failure is a safe target error. Confirmed-missing workflow is deferred to a
future existing-target/reconcile boundary. Untracked existing repositories are
never adopted; diagnostics identify group ID and repository name, and manual
cleanup or future reconcile is required.

Public group Apply now runs preflight → executor → full-success-only manifest-v2
write. Failed group Apply writes no manifest; partial manifests, lifecycle
state, recovery, and automatic adoption remain deferred. A failure after GitHub
mutation may require manual cleanup or a future reconcile workflow.

The pure group Apply manifest finalizer enforces that full-success boundary
before producing v2-ready targets and student mappings. Its output is covered
through the v2 renderer, loader, normalized repository-target view, and
repository-mappings readback. It remains pure and does not write files.

The internal group manifest writer wraps that finalizer, renders the v2 YAML,
and writes only the standard assignment manifest path after a full success. It
refuses partial results and paths outside the course repository. Public Apply
uses it only after every group target succeeds.

Graider currently persists manifest schema version 1. Its records are
per-student, but `normalizeManifestRepositories` provides a repository-centric
view: repository targets plus student-to-repository mappings. Individual
assignments produce exactly one target and mapping per student.

This is compatibility groundwork only. Existing manifests remain readable and
new applies continue to write schema version 1; no migration is required.

Group grading, status, reports, dashboard display, and access-page polish remain
deferred. They must preserve the normalized mapping contract so multiple
students can associate with one repository.

## Read-only CLI boundary

`graider assignment repository-mappings <assignment.yml> --json` is the approved
boundary for Electron services. It reads the local legacy manifest and returns
normalized targets and student mappings; it makes no writes or network calls.
Electron must call this JSON command rather than import backend manifest code.
Missing manifests are reported as `not_applied`. Group Apply writes v2 manifests
with shared student mappings; group-specific UI polish remains deferred.

The access-page status, generation, and publish-readiness IPC path now awaits
this read-only command through the Electron CLI runner. Direct manifest YAML
parsing is no longer used to resolve access-page repository links. Email preview
remains deferred.

## Group configuration safety guard

Assignment configuration can now record `repository_mode: group` with an
assignment-local `groups.csv` (`group_id,student_id`). Group Apply Preview
builds an in-memory repository target per group ID, using that ID in the normal
repository naming pattern and assigning each member planned `admin` access. This is configuration
only: Apply Preview shows one target per group. Apply creates one repository per
group after preflight, gives every group member `admin` access, and writes a v2
manifest only after all targets succeed. Group grading, status, and reporting
remain deferred.

Follow-up: U2C wires access pages/email preview; U2D adds lifecycle/workflow
metadata for status/report/dashboard; U2E migrates apply planning; U3 adds group
configuration and apply behavior.

## Apply execution identity

Apply planning and execution now carry repository targets internally. Individual
mode creates one target per active student and adapts that target to the
existing v1 per-student manifest record. Group targets remain preview-only and
group Apply uses those targets for mutation and v2 persistence, while individual
Apply retains its v1 compatibility adapter.

## Manifest v2 preparation

Manifest loading accepts legacy v1 individual records and v2 repository targets
with per-student mappings. The v2 YAML renderer is deterministic and is
used by group Apply after full target success. Individual Apply continues to
write v1.
