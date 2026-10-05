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

## Phase 1.2B-1 packaged proof

The reusable packaged proof lives under `ui/scripts`. On native macOS arm64 run:

```bash
npm --prefix ui run package:git-proof:mac
npm --prefix ui run verify:git-proof:mac
```

On native Windows x64 run the corresponding `:win` commands. The isolated
`Bundled Git packaged proof` workflow performs the Windows commands automatically. The proof
verifies:

1. `resources/app.asar.unpacked/node_modules/dugite/git/cmd/git.exe` exists and has PE machine type
   `0x8664`.
2. A packaged-main-process probe resolves that exact path.
3. With the Git child environment's `PATH` empty, the packaged probe repeats clone, status, commit,
   binary diff, clean/conflicting `apply --3way --index -`, and push/delete against a sandbox bare
   remote whose path contains spaces.
4. The ordinary packaged Electron executable, launched with `ELECTRON_RUN_AS_NODE=1`, runs all
   repository mechanics and emits `PACKAGED_DUGITE_PROOF_OK`.

Do not count a macOS cross-built Windows artifact as this proof: Dugite's postinstall selects the
payload using the install host platform, so acceptance installs dependencies on native Windows x64.
Signing, installers, and notarization remain Phase 3 work.

## Phase 1.2B-2 private-GitHub live proof

The manual `Bundled Git private GitHub proof` workflow
(`.github/workflows/bundled-git-private-proof.yml`) runs the existing packaged verifier on native
macOS arm64 and Windows x64. Dispatch it from the Actions tab only after configuring a dedicated
private sandbox repository; never use Graider itself, a course repository, or a student repository.

Configure these repository settings before dispatching:

```text
secret: GRAIDER_LIVE_DUGITE_GITHUB_TOKEN
variables: GRAIDER_LIVE_DUGITE_REPOSITORY
           GRAIDER_LIVE_DUGITE_BRANCH_PREFIX
```

The token is mapped inside the workflow to `GRAIDER_GITHUB_TOKEN`. Set the repository variable to
the explicit HTTPS URL of the dedicated private sandbox and use a dedicated prefix such as
`graider-git-engine-proof/`. The workflow fails before packaging or GitHub mutation when any of
these settings is unavailable. Use **Actions → Bundled Git private GitHub proof → Run workflow** to
dispatch it; a successful run must leave no generated proof branch behind.

The packaged verifier requires these gates:

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
