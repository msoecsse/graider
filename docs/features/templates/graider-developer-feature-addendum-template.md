# Graider Developer Feature Addendum Template

Fill this out after reviewing the faculty feature request. This addendum gives Codex the engineering context needed to design and implement the feature safely.

---

## A. Feature Classification

**Priority:**

```text
blocker / high / medium / low / backlog
```

**Feature type:**

```text
config validation / roster validation / GitHub readiness / plan / apply / manifest / report / publish / grade / CLI output / docs / testing / architecture / other
```

**Affected command or area:**

```text
validate / plan / apply / grade / report / archive / remove-access / config / docs / tests / unknown
```

**MVP status:**

```text
in scope now / candidate for next release / defer / needs discussion
```

---

## B. Proposed Behavior

Describe the intended behavior precisely.

```text

```

User-facing command or workflow, if applicable:

```bash

```

Generated files or outputs, if applicable:

```text

```

---

## C. Requirements and Acceptance Criteria

Functional requirements:

```text
- [ ]
- [ ]
```

Nonfunctional requirements:

```text
- [ ]
- [ ]
```

Acceptance criteria:

```text
- [ ] The feature is covered by tests.
- [ ] Existing behavior is preserved.
- [ ] JSON/YAML fixtures remain valid.
- [ ] npm run typecheck passes.
- [ ] npm run lint passes.
- [ ] npm run format:check passes.
- [ ] npm test passes.
- [ ] npm run build passes.
```

Additional acceptance criteria:

```text
- [ ]
```

---

## D. Suspected Implementation Area

Likely files or modules:

```text

```

Relevant existing tests:

```text

```

New tests likely needed:

```text

```

---

## E. Safety and Privacy Constraints

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
[ ] Must be additive and safe to rerun
```

Additional safety notes:

```text

```

---

## F. Scope Boundaries

The feature may change:

```text

```

The feature must not change:

```text

```

Out of scope:

```text

```

---

## G. Design Notes for Codex

Implementation hints, architecture notes, or preferred approach:

```text

```

Potential edge cases:

```text
- 
- 
```

Potential migration or compatibility concerns:

```text

```

---

## H. Documentation Updates Needed

Check all that apply:

```text
[ ] README
[ ] docs/runtime.md
[ ] docs/generated-files.md
[ ] docs/error-warning-catalog.md
[ ] docs/github-token-permissions.md
[ ] docs/troubleshooting.md
[ ] docs/examples
[ ] No documentation update expected
```

Specific docs notes:

```text

```

---

## I. Stop Conditions for Codex

Codex should stop and report instead of implementing if:

```text
- [ ] The requested feature conflicts with existing requirements.
- [ ] The feature requires live GitHub access to design safely.
- [ ] The feature would require destructive repository behavior.
- [ ] The feature would expose private student data.
- [ ] The feature is larger than one focused change.
- [ ] The feature requires schema changes that are not specified.
```

Additional stop conditions:

```text
- [ ]
```

---

## J. Notes for Codex

Additional implementation context:

```text

```
