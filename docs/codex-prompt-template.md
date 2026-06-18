# Codex Prompt Template

Use these templates for future Graider Codex slices. Reference the shared
contracts instead of repeating the same boilerplate.

For small bugfixes, prefer the compact contract in
[Codex Bugfix Contract](codex-bugfix-contract.md).

## Backend JSON Command Slice

```markdown
# Graider Codex Prompt — Slice <N>: <Title>

Read and follow:

- docs/codex-development-contract.md
- docs/codex-backend-json-command-contract.md
- <feature-specific docs>

Goal:
...

Command / Behavior:
...

JSON Contract Delta:
...

Out of Scope:
...

Tests:
...

Docs:
...

Acceptance:
...
```

## Electron UI Slice

```markdown
# Graider UI Codex Prompt — UI-<N>: <Title>

Read and follow:

- docs/codex-development-contract.md
- docs/codex-electron-ui-contract.md
- <feature-specific docs>

Goal:
...

UI Behavior:
...

IPC / Command Delta:
...

Out of Scope:
...

Tests:
...

Docs:
...

Acceptance:
...
```

## Documentation/Stabilization Slice

```markdown
# Graider Codex Prompt — Docs: <Title>

Read and follow:

- docs/codex-development-contract.md
- <specific docs>

Goal:
...

Docs to Update:
...

Must Capture:
...

Out of Scope:
...

Validation:
...

Acceptance:
...
```

## Bugfix Slice

```markdown
# Graider Codex Prompt — Bugfix: <Title>

Read docs/codex-bugfix-contract.md.

Bug:
...

Expected:
...

Start files:
...

Constraints:
...

Tests:
...

Validation:
...

Acceptance:
...
```
