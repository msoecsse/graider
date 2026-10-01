# ITEM-16 and ITEM-18 — test infrastructure

## ITEM-16

Added the dedicated `ui/vitest.snapshot.config.ts` entry point and the
`npm --prefix ui run snapshots` command. The command captures test DOM into
`ui/.ui-snapshots/html`, wraps it with `globals.css`, and produces Electron
PNGs in `ui/.ui-snapshots/png`. Generated output is ignored. Capture now waits
for document font/layout readiness, reuses one hidden BrowserWindow for the
batch, supports Linux `xvfb-run`, and fails clearly when output or any page is
missing.

The full command was run successfully with real screenshot output.

## ITEM-18

Added a shared three-student lifecycle fixture covering not-started,
in-progress, and published grading states. The global test setup and the
Assignment Detail and Dashboard page-level API fixtures use it by default.
Assignment Detail coverage now proves the default fixture renders lifecycle
rows, while existing explicit empty/unavailable lifecycle coverage remains.
