# ITEM-36: roster parser convergence

`parseAndValidateRosterCsv` is now the production CSV parse-and-validation
path for the CLI roster loader, Course Setup imports, Electron roster reads,
and renderer uploads. The loader maps shared record row numbers back onto its
`RosterStudent` source locations before cross-file duplicate validation.

Course Setup retains only its established exact canonical-or-legacy
seven-column header acceptance adapter. Accepted legacy input is normalized and
written as the canonical four-column roster. Electron services load the shared
module from the existing generated main-process backend pattern, avoiding a
second parser in the Electron TypeScript compilation boundary.

The shared parser now also supplies normalized candidate records and row
locations for callers that need duplicate diagnostics even when another row
validation error is present. `src/io/csv.ts` remains for non-roster dashboard
and group-preview parsing.

ITEM-33 is deliberately still open: no arbitrary LMS-header matching, fuzzy
mapping, or mapping UI was added.
