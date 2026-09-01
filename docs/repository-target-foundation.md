# Repository Target Foundation

## Internal group-target executor

Group configuration, preview, Apply preflight, and public Apply execution exist. The dependency-injected
`src/groups/group-target-executor.ts` is tested only with mocked GitHub
dependencies. It performs one
repository operation per group target, never per student; adds deduplicated
members as `admin` collaborators; applies configured faculty/grader teams; and
returns in-memory target identities and URLs for manifest-v2 construction. It
does not write manifests itself.

It is fail-fast: repository, collaborator, team, and workflow API failures
stop later targets without cleanup. A workflow that is not observable
immediately after repository creation is treated as transient without a
warning; API failure is a safe target error. Confirmed-missing workflow is
deferred to a future existing-target/reconcile boundary. Untracked existing
repositories are never adopted; diagnostics identify group ID and repository
name, and manual cleanup or future reconcile is required.

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

Individual Apply continues to create one repository per active student and
writes manifest-v1 records. Group Apply creates one repository per `group_id`,
adds every member as an `admin` collaborator, applies the configured
faculty/grader team permissions, and writes manifest-v2 only after every planned
target succeeds. Existing v1 manifests remain readable; no migration is
required.

`normalizeManifestRepositories` provides a repository-centric view over both
manifest versions: repository targets plus student-to-repository mappings.
`assignment repository-mappings --json` exposes that view for v2 group
manifests, preserving one target per group repository and one mapping per
student.

Grading consumers use `normalizeGradingTargets`, built on the manifest target
normalization, rather than reading the v1-only `manifest.repositories` list.
For an individual manifest this remains one target per student. For a group v2
manifest it dispatches and observes one workflow per group target, then maps
that shared target result back to every group member in status and report rows.
Grade-preview rows likewise represent one dispatchable group target. Group
status now exposes one target row per shared repository alongside its
per-student compatibility rows. Faculty report collection reads each group
repository/workflow/artifact once and projects the shared result to each member.
Dashboard/status/report presentation and recovery/reconcile remain deferred.

`assignment download-repositories --destination <folder> --json` uses the same
normalized targets. It clones one folder per individual repository or shared
group target, never one clone per group member. This first release is
clone-only: an existing target folder is reported and left untouched rather
than being updated or overwritten.

## Read-only CLI boundary

`graider assignment repository-mappings <assignment.yml> --json` is the approved
boundary for Electron services. It reads the local v1 or v2 manifest and returns
normalized targets and student mappings; it makes no writes or network calls.
Electron must call this JSON command rather than import backend manifest code.
Missing manifests are reported as `not_applied`. Group Apply writes v2 manifests
with shared student mappings; group-specific UI polish remains deferred.

The access-page status, generation, and publish-readiness IPC path now awaits
this read-only command through the Electron CLI runner. Direct manifest YAML
parsing is no longer used to resolve access-page repository links.

## Group configuration safety guard

Assignment configuration can now record `repository_mode: group` with an
assignment-local `groups.csv` (`group_id,student_id`). Group Apply Preview is
read-only and builds one in-memory repository target per group ID, using that ID
in the normal repository naming pattern and assigning each member planned
`admin` access. Group Apply execution is supported for a valid preview and
preflight: it creates one repository per group, gives every group member
`admin` access, applies configured teams, and writes a v2 manifest only after
all targets succeed. Group grading, status, reporting, and dashboard display
remain deferred.

## Apply execution identity

Apply planning and execution now carry repository targets internally. Individual
mode creates one target per active student and adapts that target to the
existing v1 per-student manifest record. Group Apply Preview is read-only;
group Apply uses its group targets for mutation and v2 persistence, while
individual Apply retains its v1 compatibility adapter.

## Manifest v2 preparation

Manifest loading accepts legacy v1 individual records and v2 repository targets
with per-student mappings. The v2 YAML renderer is deterministic and is
used by group Apply after full target success. Individual Apply continues to
write v1.
