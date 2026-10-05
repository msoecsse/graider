# Git-engine selection spike

This directory is disposable Phase 1.2A proof code. It calls Dugite directly and is not a
second production Git architecture. Production continues to use
`src/git/system-git-workspace.ts`.

## Deterministic local proof

```bash
npx vitest run tests/spikes/git-engine/dugite-executor.test.ts --no-file-parallelism
```

The test passes an empty `PATH` to every candidate Git child. It verifies the resolved executable
is the Dugite package payload, checks the native executable header on macOS arm64 and Windows x64,
and covers paths with spaces, clone/no-checkout clone, status, commits, branch/ref operations,
binary diff, three-way indexed apply, conflict index stages, recovery, operation-scoped auth
configuration, SHA-1/SHA-256 local repositories, an ASAR-path simulation, and a small performance
sanity fixture. The macOS-only interoperability case deliberately uses `/usr/bin/git` only to
create and validate a canonical external repository; it is separate from the no-system-Git proof.

## Phase 1.2B Windows x64 packaged proof

Run the deterministic test on a native Windows x64 runner after a clean install. The PE-header
assertion must execute (not skip), and the first test must report `process.platform === "win32"`
and `process.arch === "x64"`. Then package the Electron app after making the runtime dependency and
ASAR changes described in `docs/graider-git-engine-selection.md` and verify:

1. `resources/app.asar.unpacked/node_modules/dugite/git/cmd/git.exe` exists and has PE machine type
   `0x8664`.
2. A packaged-main-process probe resolves that exact path.
3. With the Git child environment's `PATH` empty, the packaged probe repeats clone, status, commit,
   binary diff, clean/conflicting `apply --3way --index -`, and push/delete against a sandbox bare
   remote whose path contains spaces.
4. The packaged app starts after code signing and installer assembly, proving that ASAR unpacking,
   executable signing, and resource resolution survived packaging.

Do not count a macOS cross-built Windows artifact as this proof: Dugite's postinstall selects the
payload using the install host platform, so the acceptance run must install dependencies on native
Windows x64 unless Phase 1.2B first adds an explicit target-payload staging step.

## Phase 1.2B private-GitHub live proof

Use a dedicated private sandbox repository, never a course or production repository. Extend the
existing `tests/live` convention with these gates:

```text
GRAIDER_RUN_LIVE_GITHUB_TESTS=true
GRAIDER_RUN_LIVE_DUGITE_GIT_TESTS=true
GRAIDER_RUN_LIVE_DESTRUCTIVE_TESTS=true
GRAIDER_GITHUB_TOKEN=<sandbox-scoped token>
GRAIDER_LIVE_DUGITE_REPOSITORY=https://github.com/<sandbox-org>/<private-repo>.git
GRAIDER_LIVE_DUGITE_BRANCH_PREFIX=graider-git-engine-proof/
```

The gated test must clone into a path containing spaces, fetch, create an allow-empty proof commit,
push `HEAD` to a unique branch under the required prefix, fetch/verify that ref, and delete only
that branch in `finally`. Each network invocation must use `GIT_CONFIG_COUNT` configuration with a
cleared credential helper, the GitHub-scoped extra header, and `GIT_TERMINAL_PROMPT=0`. It must
assert that the token is absent from argv, remote/config, results, and safe errors. Repeat from the
packaged macOS arm64 app and packaged Windows x64 app.
