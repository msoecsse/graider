# Graider Codex Instructions

This is the Codex entry point for Graider. Keep it concise. Shared workflow and
engineering rules live in canonical contracts; task-specific requirements live
in GitHub issues.

## Required reading

Before editing, read:

- `docs/agent-workflow-contract.md`
- `docs/codex-development-contract.md`
- `docs/graider-cross-platform-compatibility.md`

For bug fixes, also read:

- `docs/codex-bugfix-contract.md`

Then read only the additional canonical documents named by the current GitHub
issue. Do not scan broad documentation trees unless the issue requires it.

## Model and context policy

Issues use these execution labels:

- `codex:luna-low` — documentation, mechanical changes, and straightforward narrow fixes.
- `codex:sol-medium` — normal implementation work; default for most issues.
- `codex:sol-high` — architecture, security, concurrency, or difficult migration/state reasoning.

Issues also use:

- `context:fresh` — default. Recover required state from the repository, issue, commits, and canonical docs.
- `context:continue` — only when essential reasoning is not yet durable in the repository and continuing the current context is explicitly justified.

If an issue is harder than its assigned model/effort:

- do not struggle indefinitely in the cheaper configuration;
- if scope is the problem, split the issue instead of escalating;
- if genuine reasoning difficulty is the problem, update the issue to the next appropriate model label, explain why, and stop so it can restart in a fresh context.

Do not escalate merely because an issue is large.

## Graider-specific engineering reminders

The shared development contract is authoritative. In particular:

- strict TypeScript;
- no `break`;
- no `continue`;
- no `while (true)`;
- no returns from `void` methods;
- no unexplained numeric literals; use descriptive constants;
- no unnecessary dependencies;
- never expose or persist GitHub tokens or authorization headers;
- never require real credentials in automated tests;
- no live GitHub tests unless explicitly requested.

macOS Apple Silicon/arm64 and Windows x64 are first-class production targets.
Follow `docs/graider-cross-platform-compatibility.md` for platform-sensitive
work. Production Git operations must use Graider's bundled Git infrastructure.

Preserve the renderer -> preload/IPC -> Electron/backend trust boundary. The
renderer must not directly access GitHub, filesystem APIs, child processes,
environment variables, or backend modules.
