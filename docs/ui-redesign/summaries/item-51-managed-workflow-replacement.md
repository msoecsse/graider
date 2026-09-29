# ITEM-51 — Explicit canonical Graider workflow replacement

## Outcome

Apply remains conservative. It still refuses to overwrite unmanaged and
unsupported workflow content. A separate, explicitly-confirmed operation now
installs Graider's canonical `.github/workflows/grade.yml` using the existing
managed-grading eligibility rule, renderer, and classifier.

The shared `manuallyInstallManagedGradingWorkflow` primitive is install-only:
it creates a missing file, does nothing for canonical content, and replaces
outdated managed, unmanaged, and unsupported-version content after
confirmation. Its replace-and-run predecessor composes installation followed
by dispatch, so write and dispatch outcomes remain separate.

## UI behavior and trust boundary

Assignment Detail offers **Replace with Graider workflow** for eligible
configured templates. Its backend reconstructs the assignment path, effective
(including inherited) grading, repository, branch, and canonical YAML from
trusted configuration. The renderer cannot select another repository, branch,
path, or YAML. The read-only preview identifies the target, branch, exact path,
classification, and create/no-change/replace action; it does not display the
old YAML. Template installation never dispatches.

The student workflow dialog is now **Replace Graider workflow…** with a
checked-by-default **Run grading after replacement** option. Unchecking it
installs only and does not require a submission SHA. Checking it preserves the
existing replace-and-run behavior and requires the canonical SHA. The trusted
manifest/student mapping and faculty scope continue to determine the target.

The read-only preview carries a SHA-256 fingerprint of the observed content.
The confirmed template write rereads it and rejects a changed file as stale,
requiring a new preview rather than silently replacing newly changed content.
A failed write never dispatches; a successful write is retained if dispatch
subsequently fails. Manual acceptance testing of the new template and student
dialogs remains required.

## Validation

Focused root workflow/context tests and focused UI workflow repair tests were
run during implementation, followed by branch validation where recorded in the
handoff. Existing Apply deployment behavior is unchanged.
