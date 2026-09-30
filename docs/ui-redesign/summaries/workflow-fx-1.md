# WORKFLOW-FX-1: conditional JavaFX/FXML/TestFX managed workflow

## Summary

The existing `java-junit-checkstyle` managed preset now supports both ordinary
Java/JUnit submissions and JavaFX/FXML/TestFX submissions without adding a
second preset or faculty-facing configuration. The exact checked-out submission
selects the path at workflow runtime.

## Runtime Detection

The **Detect JavaFX requirements** step runs immediately after checkout and
writes `GRAIDER_JAVAFX_REQUIRED=true` or `false` to `$GITHUB_ENV`. It activates
JavaFX for:

- any `*.fxml` file below `src/`;
- JavaFX imports below `src/`, `test/`, or `tests/`;
- TestFX imports below those source roots;
- JavaFX `requires`, `requires transitive`, or `requires static` module
  declarations; or
- fully qualified JavaFX package references.

The log reports `JavaFX required: yes` with each detected reason, or
`JavaFX required: no` and the standard-environment decision. Matching is
source-oriented and does not search the repository indiscriminately for the
word `javafx`.

## Plain Java Path

The plain path sets up Java 25 and downloads the core Checkstyle, JUnit,
Mockito, Byte Buddy, Byte Buddy agent, and Objenesis dependencies. It includes
recursive repository `lib/*.jar` files, compiles without a JavaFX module path,
and invokes Java/JUnit directly. It does not install Xvfb/GTK/audio packages or
download JavaFX JARs.

## JavaFX/TestFX Path

The JavaFX path conditionally installs `xvfb`, `libgtk-3-0t64`, and
`libasound2t64`, then downloads and validates Linux JavaFX 25.0.2 base,
graphics, controls, FXML, and Swing JARs. Shared compile and JUnit scripts populate
JavaFX argument arrays only on this path. JUnit uses the same tag selection,
class-path scan, reports directory, and failure behavior, with its command
launched under Xvfb and `-Dprism.order=sw`.

No `--add-opens` or `--add-exports` flags were added: the existing JavaFX 25 /
Xvfb strategy and covered command construction provide no demonstrated need
for reflective access exceptions.

## FXML Resource Staging

After successful JavaFX compilation, the workflow copies each
`src/<relative-path>/<name>.fxml` to
`$BUILD_DIR/<relative-path>/<name>.fxml`. The null-delimited loop creates parent
directories, preserves nested paths and content, and treats zero FXML files as
a no-op. Thus both `getResource("Main.fxml")` and
`getResource("/jones/Main.fxml")` work for `src/jones/Main.fxml` compiled into
the `jones` package path.

## Repository Library Contract

Repository `lib/**/*.jar` discovery remains recursive and participates in both
compilation and test execution. Graider does not download or choose TestFX; the
course/template repository remains authoritative for its TestFX JARs.

## Initial-Repository Guard

The job still excludes `github-classroom[bot]` and the zero-before-SHA push
that initially populates the repository default branch. Pushes that change only
`.github/workflows/grade.yml` remain ignored.

## Managed Workflow Upgrade Behavior

The ownership header remains:

```text
# Managed by Graider
# graider-workflow-version: 1
```

Policy and deployment regression tests prove that differing canonical content
with ownership version 1 is `managed_outdated` / `update_managed`. Identical
content remains a no-op, while unmarked and unsupported-version workflows stay
protected. Existing single and bulk repair paths continue to install the
renderer output and dispatch the canonical `submission_sha`; no repair IPC or
UI change was required.

## Evidence Contract

The workflow continues writing `graider-output/grading-results.json`,
`grading-evidence/metadata.json`, Checkstyle XML, and JUnit XML, then uploads
the configured result path plus `grading-evidence/` with `if: always()`.
Artifact/result substitution, exact submission SHA, run ID/attempt metadata,
step outcome mapping, and status vocabulary are unchanged.

## Tests

Renderer coverage now protects all existing version, trigger, dependency,
library, tag, evidence, and upload invariants plus structured step conditions.
Executable shell tests run the rendered detector against plain Java, FXML,
JavaFX import, TestFX import, fully qualified reference, and each supported
module requirement form. A rendered staging-step test proves both
`src/jones/Main.fxml -> $BUILD_DIR/jones/Main.fxml` and
`src/jones/views/Main.fxml -> $BUILD_DIR/jones/views/Main.fxml`, plus the
zero-resource no-op. CLI generation and v1 policy/deployment upgrade tests were
updated for the new canonical content.

## Validation

| Command                                                                            | Result                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused workflow, CLI, policy, deployment, manual-repair, and repair-context tests | Passed — 58 passed, 1 skipped across 6 files                                                                                                     |
| `npm run typecheck`                                                                | Passed                                                                                                                                           |
| `npm run lint`                                                                     | Passed                                                                                                                                           |
| `npm run format:check`                                                             | Passed                                                                                                                                           |
| `npm test`                                                                         | Passed — 1,092 passed, 1 skipped across 121 files                                                                                                |
| `npm run build`                                                                    | Passed                                                                                                                                           |
| `npm run audit`                                                                    | Passed the configured high-severity gate; npm reported 1 low and 2 moderate development-tool advisories in Vitest/`@vitest/mocker` and `esbuild` |
| `npm --prefix ui run typecheck`                                                    | Passed                                                                                                                                           |
| `npm --prefix ui run format:check`                                                 | Passed                                                                                                                                           |
| `npm --prefix ui test`                                                             | Passed on the final full run — 1,085 passed across 146 files                                                                                     |
| `npm --prefix ui run build`                                                        | Passed with Vite's existing large-chunk advisory                                                                                                 |

Two earlier full UI attempts each hit a different unrelated timing-sensitive
test (`App.test.tsx` routing, then a grading-workspace keyboard shortcut). Each
failed test passed immediately in isolation, and the final unmodified full UI
command passed. No UI source was changed in this slice.

## Documentation

`docs/generated-files.md` now describes conditional setup, the plain-Java fast
path, repository-provided TestFX, FXML staging, and ownership-v1 replacement.
The preset section of `docs/grading-result-contract.md` documents the same
behavior without changing the result schema.

## Backlog Result

ITEM-46 is **Resolved**. The implementation remains one runtime-selected
managed Java preset and adds no assignment configuration field.

## Manual Smoke Validation

The live acceptance gap is now closed. Follow-up testing succeeded for both
paths:

1. A plain-Java assignment using the newly generated managed workflow completed
   successfully without requiring workflow replacement. This validates the
   standard path where JavaFX is not needed and the managed workflow is created
   as part of assignment setup/apply.
2. Re-Apply using the updated JavaFX workflow worked successfully for a JavaFX
   program/course. This validates the JavaFX workflow path after the workflow
   update and replacement sequence.

The live results establish successful end-to-end completion for these two
representative courses. They do not replace the local detector and workflow
regression coverage for every possible JavaFX module or repository layout.

## Deferred / Non-goals

This slice does not add another preset, a JavaFX toggle, TestFX downloads,
Maven/Gradle conversion, repository layout changes, evidence/schema changes,
repair UI changes, roster work, or ITEM-36 parser convergence.

## Next Step

ITEM-36 remains the adjacent engineering slice. It should begin separately and
is not part of WORKFLOW-FX-1.
