# WORKFLOW-FX-2: JavaFX Swing support in the canonical workflow

## Summary

A known-good student submission passed under the previous faculty workflow but
failed after canonical workflow replacement with
`NoClassDefFoundError: javafx/embed/swing/SwingFXUtils`. The failure occurred
in `ImageUtil.writeImage` during the JavaFX test path.

## Fix

The root cause was that the JavaFX path did not download `javafx.swing`. It now
downloads the JavaFX 25.0.2 Linux modules:

`base graphics controls fxml swing`

The validation list includes `javafx-swing.jar`, so a missing or corrupt Swing
JAR fails during setup. JavaFX compilation and JUnit runtime arguments now both
use:

`--add-modules javafx.controls,javafx.fxml,javafx.swing`

The existing JavaFX detector was not changed, and no separate Swing detector
was added. `javafx.web`, `javafx.media`, and other unrelated modules were not
added.

## Validation

Focused renderer and detector tests cover the Swing download, JAR validation,
compile/runtime module arguments, and a `javafx.embed.swing.SwingFXUtils`
reference activating the existing JavaFX path. Standard repository validation
passed as reported with this change.

A live retest is still required: replace the known-good student repository's
workflow again and run grading to confirm the original GitHub Actions failure
is resolved in the real environment.
