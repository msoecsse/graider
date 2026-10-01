# ITEM-5 — stylesheet decomposition

`ui/src/styles/globals.css` had grown to 3,680 lines before this refactor
(approximately 3,681 under the historical counting convention, versus the
older backlog record of 2,982 lines).

It is now the stable application entry point and imports these ordered,
contiguous fragments:

- `foundation.css` — design tokens, global primitives, actions, overlays, and
  status UI.
- `dashboard-course.css` — dashboard, course, folder, and associated early
  source-order rules.
- `setup-roster.css` — course/assignment setup and roster management.
- `assignment-detail.css` — assignment detail, grade status, and apply preview.
- `grading-workspace.css` — the existing preceding responsive block and grading
  workspace rules; keeping the responsive block here preserves its original
  cascade position.
- `shared-components.css` — PageHeader, OverflowMenu, LifecycleStrip,
  DataTable, TechnicalDetails, confirmation UI, comment library, and the final
  responsive block.

The fragments are literal contiguous slices of the prior stylesheet. Concatenating
them in `globals.css` import order preserved every selector, declaration, value,
media query, and source-order relationship; the only differences are five blank
whitespace lines removed at fragment boundaries by the formatter. The `:root`
token block is present once, in `foundation.css`. No intentional visual changes
were made.

Validation completed with the required root and UI typecheck, lint, formatting,
test, build, audit, and snapshot commands. The snapshot run passed and generated
real PNG captures under the ignored UI snapshot directory.
