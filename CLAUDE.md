# CLAUDE.md

Guidance for Claude Code working in this repository.

---

## 1. The rule that matters most

**Ask. Do not invent.**

This codebase was built quickly and has grown features faster than it has grown
specifications. That means you will regularly hit places where the intended
behaviour is genuinely unclear. When that happens, the correct action is to stop
and ask, not to choose something plausible and continue.

Inventing a requirement is worse than pausing, because a plausible guess gets
committed, tested against itself, and becomes the de facto spec. Nobody catches
it in review, because the tests pass.

### Stop and ask when any of these is true

- The task does not say what should happen in an edge case you have hit.
- Two documents, or a document and the code, disagree.
- You need a value that is not specified: a threshold, a default, a sort order,
  a date format, a limit, an error message, a label.
- The change would alter data, GitHub repositories, workflows, rosters, or
  student-visible output, and the instruction is not explicit about it.
- A term in the task maps to more than one thing in the code.
- The obvious implementation would require touching files outside the stated
  scope.
- The task appears already done, or partly done, in a way you did not expect.
- You cannot run a required validation command.

### How to ask

State the question and stop. Do not ask and then proceed on an assumption in the
same turn.

```
BLOCKED: <one-line description>

What I found:      <the specific code, doc, or test, with file:line>
Why it's ambiguous: <the two or more readings>
Options:
  A. <option, and what it implies>
  B. <option, and what it implies>
Recommendation:    <which you'd pick and why — but do not act on it>
```

One question at a time where possible. If several are genuinely independent,
list them all at once rather than blocking repeatedly.

### When you must proceed under uncertainty

If told to keep going despite an unresolved question, record the assumption in
the code as a comment and in your final summary under **Assumptions Made**.
Never bury it silently.

---

## 2. Scope discipline

**Do only the task you were given.**

- Do not fix unrelated bugs you notice. Report them at the end instead.
- Do not refactor code you are merely reading.
- Do not rename things for consistency unless that is the task.
- Do not add dependencies, scripts, commands, config files, or abstractions that
  the task did not ask for.
- Do not "improve" behaviour that is working as documented.
- Do not delete tests to make a change pass.

If a cleanup is genuinely required to complete the task, say so before doing it.

When you finish, list anything you deliberately left alone under **Deferred**.
That list is valuable; it is how the backlog gets written.

---

## 3. What this project is

Graider is GitHub-based assignment management for university courses. Faculty
create assignments, apply them to student repositories, grade submissions, and
publish reports back to those repositories.

It ships as two things from one repository:

- A **CLI** (`src/cli`, built with tsup to `dist/`), which owns all GitHub
  interaction and business logic and emits machine-readable JSON.
- An **Electron desktop app** (`ui/`), a React + Vite renderer that shells out to
  the CLI through the Electron main process and renders its JSON.

The renderer never talks to GitHub directly. It calls `window.graiderUI`, exposed
by `ui/electron/preload.ts`. Keep that boundary intact.

Users are faculty, not developers. Roughly four today, growing toward twenty,
including people who use it a few times a term.

---

## 4. Repository map

```
src/                     CLI and backend logic
  cli/index.ts           CLI entry point
tests/                   backend tests (vitest)
  live/                  live GitHub tests — never run automatically
ui/                      Electron desktop app
  electron/              main process, preload, IPC contract
  src/                   React renderer
    dashboard/           entry screen; also holds most navigation state
    assignment-detail/   assignment screen
    grading-workspace/   grading screen
    roster-manager/      roster editing
    apply-preview/  grade-preview/  grade-status/  faculty-report/
    course-setup/  assignment-setup/  assignment-edit/
    components/          shared components
    styles/globals.css   all application styling
    test/setup.ts        vitest setup
docs/                    contracts, command specs, developer guides
  bugs/  features/  prompts/  release/  examples/
examples/                sample course data
eslint.config.mjs        the only eslint config; it covers the repo root
```

### Things about this codebase that surprise people

- `ui/src/App.tsx` renders `DashboardPage` and nothing else. There is no router.
  Navigation is a set of nullable `useState` selections inside `DashboardPage`
  resolved by early returns.
- `DashboardPage.tsx`, `AssignmentDetailPage.tsx`, and
  `GradingWorkspacePage.tsx` are each roughly 1,000–2,600 lines.
- All styling lives in one `globals.css` of about 2,100 lines. There is no
  CSS-in-JS and no module system for styles.
- `GradingWorkspacePage` does not use the shared `primary-action` /
  `secondary-action` classes at all, so its controls render as browser defaults.
- There is **no lint script in `ui/`**. ESLint is configured at the repo root
  only. `npm run lint` from inside `ui/` will fail.

---

## 5. Commands

Node 24 is required (`engines: >=24 <25`). Use npm.

### Backend or shared code

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

`npm run check` runs typecheck, lint, format:check, and test together.

### UI code

```bash
cd ui
npm run typecheck      # runs both tsconfig.json and tsconfig.node.json
npm test               # vitest
npm run build
```

There is no `lint` in `ui/`. Run `npm run lint` from the repo root, which covers
the whole tree.

`npm run format:check` exists in both packages.

### Do not run without being asked

- `npm run test:live` or anything under `tests/live` — these hit real GitHub.
- `npm run package`, `package:mac`, `package:win`, `make`, `release:rc1`.
- `git push`, branch deletion, force operations, or opening pull requests.
- Anything that mutates a real GitHub organization, repository, or roster.

### Test health

At the time this file was written the UI suite was 277 passing tests. Treat a
drop in that number as a regression to explain, not a detail to move past.

---

## 6. Read these before editing

`docs/codex-development-contract.md` is the authoritative baseline for all work
in this repository. It predates Claude Code and is written as "Codex" guidance,
but it applies to any agent, including you. Read it before your first edit in a
session.

Then read whichever of these matches your task:

| Task area                    | Document                                                                   |
| ---------------------------- | -------------------------------------------------------------------------- |
| Any change                   | `docs/codex-development-contract.md`                                       |
| Bug fix                      | `docs/codex-bugfix-contract.md`                                            |
| CLI JSON output              | `docs/cli-json-contract.md`, `docs/codex-backend-json-command-contract.md` |
| Electron / renderer boundary | `docs/codex-electron-ui-contract.md`                                       |
| A specific screen            | the matching `docs/electron-*-dev.md`                                      |
| A specific command           | the matching `docs/*-command.md`                                           |
| Errors and warnings          | `docs/error-warning-catalog.md`                                            |
| Architecture                 | `docs/graider-architecture.md`                                             |
| Tests                        | `docs/graider-test-plan.md`                                                |
| UI redesign work             | `docs/ui-redesign/README.md`                                               |

If your change contradicts one of these documents, that is a **stop and ask**
condition, not a licence to update the document.

---

## 7. Coding standards

Section 3 of the development contract governs. The rules below are repeated here
because they are unusual and easy to violate without noticing:

- Strict TypeScript. Do not loosen compiler settings.
- **Do not use `break`.**
- **Do not use `continue`.**
- **Do not use `while (true)`.**
- Do not return values from `void` methods.
- No magic numbers — use named constants.
- Small modular functions with explicit typed boundaries.
- Prefer existing helpers, patterns, and validators over new ones.
- Do not add dependencies.

### Security

- Never log, render, persist, or serialize GitHub tokens.
- No secrets, authorization headers, raw `process.env`, or raw stack traces in
  JSON output, UI output, logs, diagnostics, tests, or snapshots.
- Never require a real token in an automated test. Mock the GitHub client.

### Tests

- Update existing tests to match new behaviour. Do not delete them.
- New behaviour gets new tests.
- Deterministic and local. No live GitHub calls.
- Follow the existing test style in the directory you are working in.

---

## 8. UI work

If the task is part of the redesign, `docs/ui-redesign/README.md` is the
specification. Section 2 of that document (action hierarchy, plain language,
hiding implementation detail, modals, accessibility) is non-negotiable, and
section 7 is the definition of done.

Additionally, for any renderer change:

- Keep the IPC boundary. The renderer calls `window.graiderUI`; it does not
  reach GitHub, the filesystem, or `child_process` directly.
- Interactive elements are real `<button>`, `<a href>`, or labelled `<input>`.
  Never `onClick` on a `div` or `span`.
- Icon-only buttons need `aria-label`.
- No raw status enums, ISO timestamps, exit codes, or filesystem paths in
  faculty-facing text.
- New styles go in `globals.css` following the existing naming. Do not introduce
  a second styling mechanism.

---

## 9. Working rhythm

- One task per session. Ask the user to clear context between tasks.
- Read before writing. Inspect the existing implementation enough to preserve
  current behaviour and terminology.
- Make the change, run the relevant validation commands, then report.
- Commit only when validation passes, and only when asked to commit.
- If a validation command fails for a reason unrelated to your change, report
  the command, the failure, and the risk. Do not work around it.

---

## 10. Final response format

Unless the task specifies otherwise:

```markdown
## Summary

## Files Changed

## Tests Added or Updated

## Documentation

## Validation Commands Run

## Assumptions Made

## Result

## Deferred
```

Under **Validation Commands Run**, list each command and whether it passed,
failed, or was skipped with a reason.

**Assumptions Made** should be empty. If it is not empty, each entry is a
question you should have asked. Say so plainly rather than presenting the
assumption as a decision.

**Deferred** is where unrelated problems you noticed go. Describe them well
enough to become tickets.
