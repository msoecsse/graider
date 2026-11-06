# Graider Claude Code Instructions

This is the Claude Code entry point for Graider. Keep it concise. Shared
workflow and engineering rules live in canonical contracts; task-specific
requirements live in GitHub issues.

## Required reading

Before editing, read:

- `docs/agent-workflow-contract.md`
- `docs/codex-development-contract.md`
- `docs/graider-cross-platform-compatibility.md`

Despite its filename, `docs/codex-development-contract.md` is the shared Graider
engineering contract and applies to Claude Code too.

For bug fixes, also read:

- `docs/codex-bugfix-contract.md`

Then read only the additional canonical documents named by the current GitHub
issue. Do not scan broad documentation trees unless the issue requires it.

## Ask; do not invent

The shared workflow contract's human-decision rule is mandatory. When intended
behavior is genuinely unclear, stop and ask rather than choosing a plausible
behavior and turning it into de facto specification.

Do not ask and then proceed on an assumption in the same task.

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

Preserve the renderer -> preload/IPC -> Electron/backend trust boundary.
Renderer code must not directly access GitHub, filesystem APIs, child processes,
environment variables, or backend modules.
