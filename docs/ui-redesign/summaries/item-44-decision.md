# ITEM-44 decision: Remove roster is roster-only

The ITEM-44 feasibility pass verified that `sections[].roster` is optional in
the validated term model and remains optional through `loadTermConfig` and
roster loading. A section with no roster is a valid configuration state; it is
not Apply-ready because it yields no target students.

Current PR12-5 code is defective at the product-contract level: both
`removeRoster` and `removeSection` use `removeSectionAndRoster`, so both delete
the section. This decision keeps the existing two IPC methods but assigns them
their names' distinct scopes:

- **Remove roster** retains the section/faculty, removes only its roster
  reference, deletes contained associated roster CSVs and source sidecar,
  refreshes affected Student Repository Access Pages, and publishes normally.
- **Remove section** retains its current stronger section-plus-roster deletion.

This is distinct from **Clear roster rows**, which preserves a valid header-only
roster and therefore a ready zero-student summary rather than **No roster**.

The full code evidence, downstream behavior, rollback sequence, and required
test matrix are in `../item-44-remove-roster-feasibility.md`. Item 44 remains
open until the implementation slice lands.
