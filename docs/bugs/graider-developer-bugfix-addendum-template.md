# Graider Developer Bug-Fix Addendum Template

Fill this out after reviewing the faculty bug report. This addendum gives Codex the engineering context needed to create a focused regression test and safe fix.

---

## A. Bug Classification

**Severity:**

```text
blocker / high / medium / low
```

**Bug type:**

```text
config validation / roster validation / GitHub readiness / plan / apply / manifest / report / publish / grade / CLI output / docs / other
```

**Affected command:**

```text
validate / plan / apply / grade / report / archive / remove-access / unknown
```

---

## B. Suspected Area

Suspected files or modules:

```text

```

Relevant existing tests:

```text

```

---

## C. Safety Constraints

Check all that apply:

```text
[ ] Must not make live GitHub calls
[ ] Must use FakeGitHubClient in tests
[ ] Must not mutate repositories
[ ] Must not publish student reports
[ ] Must not expose student data
[ ] Must not print or store secrets
[ ] Must not change generated file schemas unless required
[ ] Must preserve backward compatibility
[ ] Must keep archive/remove-access unsupported
```

Additional safety notes:

```text

```

---

## D. Expected Regression Test

Describe the test that should fail before the fix and pass after the fix.

```text

```

Suggested test file or area:

```text

```

Required fixture changes:

```text

```

---

## E. Allowed Scope

The fix may change:

```text

```

The fix must not change:

```text

```

---

## F. Acceptance Criteria

The bug is fixed when:

```text
- [ ] A regression test reproduces the bug.
- [ ] The smallest reasonable fix is implemented.
- [ ] Existing behavior is preserved.
- [ ] JSON/YAML fixtures remain valid.
- [ ] npm run typecheck passes.
- [ ] npm run lint passes.
- [ ] npm run format:check passes.
- [ ] npm test passes.
- [ ] npm run build passes.
```

Additional criteria:

```text
- [ ]
```

---

## G. Notes for Codex

Implementation hints or context:

```text

```
