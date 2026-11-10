# Graider Agent Workflow Contract

## Purpose

This document defines the shared workflow for coding agents working in Graider.
Agent-specific entry points such as `AGENTS.md` and `CLAUDE.md` should stay thin
and reference this file instead of duplicating these rules.

Task-specific scope and acceptance criteria belong in GitHub issues. Shared
engineering rules remain in the existing Graider development contracts.

## 1. GitHub issues are the work queue

Work one implementation issue at a time.

For the current issue:

1. Confirm scope, dependencies, required reading, acceptance criteria, and validation.
2. Read only the canonical documents named by the issue plus the required shared contracts.
3. Inspect only enough repository context to implement the issue safely.
4. Add or update focused tests before implementation when practical.
5. Implement only the requested scope.
6. Run focused validation first, then the issue-required validation.
7. If validation is green, commit and push to the current development branch.
8. Close the issue with the commit SHA, concise implementation summary, validation results, and links to follow-up issues.
9. Do not start another implementation issue until the current issue is complete or explicitly blocked.

Do not open a pull request unless the issue explicitly requires one. Never
force-push and never push directly to `main` or `master`.

## 2. Ask; do not invent

Stop for human input when requirements are genuinely ambiguous, especially when
the decision affects:

- product behavior;
- architecture;
- security or trust boundaries;
- persisted data;
- GitHub repositories, permissions, teams, or workflows;
- migration semantics;
- faculty- or student-visible behavior.

When human judgment is required:

1. Search for an existing issue covering the decision.
2. If none exists, create a `needs-human-decision` issue.
3. Record the evidence, ambiguity, options, consequences, and a recommendation.
4. Mark or link the current issue as blocked.
5. Stop further work in the current phase until the decision is resolved.

Do not choose a plausible behavior and turn it into de facto specification.

## 3. Discovered work

Do not silently fix unrelated work.

When concrete additional work is discovered:

1. Search existing open issues first.
2. If none covers it, create a GitHub issue with enough context and acceptance criteria for a fresh agent task.

For a non-blocking issue:

- link or reference it from the current issue or final summary;
- continue the current issue;
- do not implement the new issue opportunistically.

For a blocking issue that requires no human decision:

- create or reuse the blocker issue;
- link the current issue as blocked by it;
- leave the worktree in a safe state;
- work the blocker next when operating from the issue queue;
- return to the blocked issue after the blocker is resolved.

If GitHub issue creation is unavailable, include a complete issue draft in the
final report instead.

## 4. Scope discipline

Do only the current issue.

- No unrelated refactors.
- No speculative cleanup.
- No new dependency, command, script, storage format, or abstraction unless required by the issue.
- Prefer existing helpers, validators, patterns, and test style.
- Never delete or weaken tests merely to make validation pass.
- Never weaken a safety, authorization, identity, filesystem, Git, or Electron trust boundary to simplify implementation.

If narrowly scoped cleanup is clearly required to complete the issue, include
it. If cleanup materially expands scope, create a blocking issue. If the
expansion requires a design decision, stop for human input.

## 5. Documentation authority

Do not treat every file under `docs/` as authoritative.

The current issue must name the canonical technical documents needed for that
task. Other documentation is supporting context only unless explicitly
designated authoritative.

If a supporting document conflicts with the issue or a named canonical
document, stop for human resolution unless the issue explicitly states which
source supersedes the other.

A concept should have one authoritative home. Prefer links over duplicated
requirements.

### User documentation

When a change alters faculty-visible UI behavior, navigation, labels, setup,
workflows, or troubleshooting, update the relevant faculty-facing
documentation in the same issue. `docs/faculty-ui-user-guide.md` is the default
current UI guide unless the issue names another user-facing document.

### Documentation cleanup

Do not opportunistically reorganize `docs/` during feature work. Documentation
consolidation belongs in dedicated documentation-audit issues that classify
files as:

- canonical/current;
- supporting/current;
- merge candidate;
- historical/archive;
- obsolete/delete.

## 6. Validation and failures

Run the lightest focused tests first, then the validation required by the issue
and shared contracts.

If validation fails because of the current change, fix it within the issue.

If an unrelated or baseline failure is discovered:

- search for an existing issue;
- create one if needed;
- if it prevents trustworthy validation of the current issue, mark the current issue blocked;
- otherwise link it and continue only if the current issue's required acceptance can still be proven.

Do not close or commit an issue as complete until its required validation is
green.

Do not run live/destructive GitHub tests, packaging, release workflows, real
organization mutations, branch deletion, or force operations unless the issue
explicitly requires them.

## 7. Phase boundaries

Each implementation phase ends with a dedicated phase-audit issue.

The phase audit must verify:

- all phase issues are closed, intentionally deferred, or explicitly blocked;
- required validation is green;
- canonical roadmap and documentation status are correct;
- no unresolved phase blocker remains;
- the worktree is clean;
- all intended commits are pushed;
- no next-phase implementation was started accidentally.

After the phase audit is complete, stop. Do not plan or implement the next
phase unless a new issue explicitly starts it.

## 8. Final issue report

Unless the issue specifies otherwise, report:

- summary;
- files changed;
- tests added or updated;
- documentation updated;
- validation commands and results;
- commit SHA;
- issue closure status;
- discovered or deferred issues;
- assumptions made.

`Assumptions made` should normally be empty. If an unresolved assumption would
affect behavior or safety, it should have been handled as a human-decision
blocker instead.

## Permanent migration regression validation

Changes affecting schemas, migration, course management, Git transactions,
authorization or reconciliation must run `npm run test:migration` from the root,
in addition to scope-required root/UI validation. Both native CI jobs (macOS arm64
and Windows x64) must pass before merging or releasing affected changes. This
suite remains required after Phase 9. See
[coverage and failure diagnosis](docs/migration-regression.md).
