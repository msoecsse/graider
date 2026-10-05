"use strict";

const { randomUUID } = require("node:crypto");
const { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } = require("node:fs/promises");
const { existsSync, readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const { basename, isAbsolute, join, normalize, relative, resolve, sep } = require("node:path");

const MAX_OUTPUT_BYTES = 10_485_760;
const TINY_OUTPUT_BOUND = 4;
const MACH_O_64_MAGIC = Buffer.from("cffaedfe", "hex");
const MACH_O_ARM64_CPU_TYPE = Number.parseInt("0100000c", 16);
const PE_HEADER_OFFSET_LOCATION = Number.parseInt("3c", 16);
const PE_X64_MACHINE_TYPE = Number.parseInt("8664", 16);
const EXPECTED_VERSION = "3.2.3";
const EXPECTED_GIT_VERSIONS = {
  darwin: "git version 2.53.0",
  win32: "git version 2.53.0.windows.4"
};
const EXPECTED_HOSTS = {
  darwin: "arm64",
  win32: "x64"
};

const fail = (message) => {
  throw new Error(message);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const resourcesDirectoryArgument = argumentValue("--resources");
assert(resourcesDirectoryArgument !== undefined, "The packaged resources directory is required.");
const resourcesDirectory = resolve(resourcesDirectoryArgument);
assert(isAbsolute(resourcesDirectory), "The packaged resources directory must be absolute.");
assert(process.env.ELECTRON_RUN_AS_NODE === "1", "The proof must run through Electron-as-Node.");
assert(typeof process.versions.electron === "string", "The proof is not running in Electron.");
assert(
  EXPECTED_HOSTS[process.platform] === process.arch,
  "The packaged proof requires native macOS arm64 or Windows x64."
);

delete process.env.LOCAL_GIT_DIRECTORY;
delete process.env.GIT_EXEC_PATH;

const appAsar = join(resourcesDirectory, "app.asar");
const appAsarUnpacked = join(resourcesDirectory, "app.asar.unpacked");
const unpackedGitRoot = join(appAsarUnpacked, "node_modules", "dugite", "git");
const packagedRequire = createRequire(join(resourcesDirectory, "app.asar", "package.json"));
const dugitePackagePath = packagedRequire.resolve("dugite/package.json");
const dugiteEntryPath = packagedRequire.resolve("dugite");
const dugitePackage = JSON.parse(readFileSync(dugitePackagePath, "utf8"));
const dugite = packagedRequire("dugite");

const normalizedAsarPrefix = `${normalize(appAsar)}${sep}`;
assert(
  normalize(dugitePackagePath).startsWith(normalizedAsarPrefix),
  "Dugite metadata is not in app.asar."
);
assert(
  normalize(dugiteEntryPath).startsWith(normalizedAsarPrefix),
  "Dugite wrapper is not in app.asar."
);
assert(dugitePackage.version === EXPECTED_VERSION, "The packaged Dugite version is not 3.2.3.");
assert(
  existsSync(join(appAsar, "node_modules", "dugite", "LICENSE")),
  "Dugite LICENSE is missing."
);

const packagedGitBinary = dugite.resolveGitBinary();
const normalizedPayloadPrefix = `${normalize(unpackedGitRoot)}${sep}`;
assert(
  normalize(packagedGitBinary).startsWith(normalizedPayloadPrefix),
  "Dugite did not resolve Git from app.asar.unpacked."
);

const main = async () => {
  const canonicalGitBinary = await realpath(packagedGitBinary);
  const canonicalPayloadRoot = await realpath(unpackedGitRoot);
  const binaryRelativeToPayload = relative(canonicalPayloadRoot, canonicalGitBinary);
  assert(
    binaryRelativeToPayload !== "" && !binaryRelativeToPayload.startsWith(`..${sep}`),
    "The resolved Git executable is outside the Dugite payload."
  );

  const listFiles = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? await listFiles(path) : [path];
      })
    );
    return nested.flat();
  };

  const payloadFiles = await listFiles(unpackedGitRoot);
  const payloadNames = new Set(payloadFiles.map((path) => basename(path).toLowerCase()));
  const executableSuffix = process.platform === "win32" ? ".exe" : "";
  assert(
    payloadNames.has(`git-lfs${executableSuffix}`),
    "The packaged Git LFS executable is missing."
  );
  assert(
    payloadNames.has(`git-credential-manager${executableSuffix}`),
    "The packaged Git Credential Manager executable is missing."
  );
  assert(payloadNames.has("notice"), "The packaged helper NOTICE is missing.");

  const executableBytes = await readFile(packagedGitBinary);
  if (process.platform === "darwin") {
    assert(
      executableBytes.subarray(0, MACH_O_64_MAGIC.length).equals(MACH_O_64_MAGIC),
      "Git is not Mach-O 64-bit."
    );
    assert(
      executableBytes.readUInt32LE(MACH_O_64_MAGIC.length) === MACH_O_ARM64_CPU_TYPE,
      "The packaged Git Mach-O CPU type is not arm64."
    );
  }
  if (process.platform === "win32") {
    const peOffset = executableBytes.readUInt32LE(PE_HEADER_OFFSET_LOCATION);
    assert(
      executableBytes.subarray(0, 2).toString("ascii") === "MZ",
      "Git is not a PE executable."
    );
    assert(
      executableBytes
        .subarray(peOffset, peOffset + 4)
        .equals(Buffer.from("PE\u0000\u0000", "binary")),
      "The packaged Git PE signature is invalid."
    );
    assert(
      executableBytes.readUInt16LE(peOffset + 4) === PE_X64_MACHINE_TYPE,
      "The packaged Git PE machine type is not x64."
    );
  }

  const bundledOnlyEnvironment = () => {
    const environment = { ...process.env, PATH: "" };
    delete environment.LOCAL_GIT_DIRECTORY;
    delete environment.GIT_EXEC_PATH;
    return environment;
  };

  const samePath = (left, right) => {
    const normalizedLeft = normalize(left);
    const normalizedRight = normalize(right);
    return process.platform === "win32"
      ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
      : normalizedLeft === normalizedRight;
  };

  const assertSpawnedPackagedGit = async (spawnedFile) => {
    assert(spawnedFile !== "", "Dugite did not report the spawned Git executable.");
    assert(
      samePath(await realpath(spawnedFile), canonicalGitBinary),
      "A Git operation did not spawn the resolved packaged executable."
    );
  };

  const runGit = async ({
    cwd,
    args,
    env = bundledOnlyEnvironment(),
    input,
    maxOutputBytes,
    secrets = []
  }) => {
    let spawnedFile = "";
    let spawnedArguments = [];
    try {
      const result = await dugite.exec(
        [
          "-c",
          "color.ui=false",
          "-c",
          "core.quotepath=false",
          "-c",
          "core.autocrlf=false",
          ...args
        ],
        cwd,
        {
          encoding: "buffer",
          env,
          maxBuffer: maxOutputBytes ?? MAX_OUTPUT_BYTES,
          ...(input === undefined ? {} : { stdin: Buffer.from(input) }),
          processCallback: (child) => {
            spawnedFile = child.spawnfile;
            spawnedArguments = child.spawnargs;
          }
        }
      );
      await assertSpawnedPackagedGit(spawnedFile);
      const argv = spawnedArguments.join("\u0000");
      assert(
        secrets.every((secret) => !argv.includes(secret)),
        "A credential entered Git argv."
      );
      return result;
    } catch (error) {
      await assertSpawnedPackagedGit(spawnedFile);
      throw error;
    }
  };

  const gitResult = async (cwd, args, options = {}) => await runGit({ cwd, args, ...options });

  const git = async (cwd, args, options = {}) => {
    const result = await gitResult(cwd, args, options);
    if (result.exitCode !== 0) {
      throw new Error(`Packaged Git operation failed: ${args[0] ?? "unknown"}.`);
    }
    return result.stdout;
  };

  const initializeRepository = async (repository) => {
    await mkdir(repository, { recursive: true });
    await git(repository, ["init", "--initial-branch=main"]);
    await git(repository, ["config", "user.email", "faculty@example.test"]);
    await git(repository, ["config", "user.name", "Faculty"]);
  };

  const commitAll = async (repository, message) => {
    await git(repository, ["add", "--all", "--"]);
    await git(repository, ["commit", "-m", message]);
    return (await git(repository, ["rev-parse", "HEAD"])).toString("utf8").trim();
  };

  const createAuthenticationEnvironment = (token) => {
    const encoded = Buffer.from(`x-access-token:${token}`).toString("base64");
    const authorization = `AUTHORIZATION: basic ${encoded}`;
    return {
      env: {
        ...bundledOnlyEnvironment(),
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_0: "credential.helper",
        GIT_CONFIG_VALUE_0: "",
        GIT_CONFIG_KEY_1: "http.https://github.com/.extraHeader",
        GIT_CONFIG_VALUE_1: authorization,
        GIT_TERMINAL_PROMPT: "0"
      },
      secrets: [token, encoded, authorization]
    };
  };

  const applyThreeWayIndexed = async (repository, patch) => {
    const application = await gitResult(repository, ["apply", "--3way", "--index", "-"], {
      input: patch
    });
    if (application.exitCode === 0) return "applied";
    const unmerged = await git(repository, ["ls-files", "--unmerged", "-z"]);
    if (unmerged.length > 0) return "conflict";
    throw new Error("Packaged Git patch application failed without a conflict index.");
  };

  const runCoreRepositoryProof = async (root) => {
    const source = join(root, "source repository with spaces");
    const remote = join(root, "bare remote with spaces.git");
    const normalClone = join(root, "normal clone with spaces");
    const noCheckoutClone = join(root, "no checkout clone with spaces");
    const trackedFile = "tracked file with spaces.txt";

    await initializeRepository(source);
    await writeFile(join(source, trackedFile), "base\n");
    const base = await commitAll(source, "Packaged Git base");
    await git(root, ["init", "--bare", remote]);
    await git(source, ["remote", "add", "origin", remote]);
    await git(source, ["push", "--set-upstream", "origin", "main"]);
    await git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    await git(root, ["clone", "--", remote, normalClone]);
    await git(root, ["clone", "--no-checkout", "--", remote, noCheckoutClone]);

    assert(
      (await readFile(join(normalClone, trackedFile), "utf8")) === "base\n",
      "Normal clone content is wrong."
    );
    assert(
      !existsSync(join(noCheckoutClone, trackedFile)),
      "No-checkout clone populated its worktree."
    );
    assert(
      (await git(normalClone, ["status", "--porcelain"])).length === 0,
      "Normal clone is not clean."
    );
    assert(
      (await git(normalClone, ["rev-parse", "HEAD"])).toString("utf8").trim() === base,
      "HEAD is wrong."
    );

    await git(noCheckoutClone, ["checkout", "-B", "main", "refs/remotes/origin/main", "--"]);
    await git(noCheckoutClone, ["checkout", "--detach", base]);
    await git(noCheckoutClone, ["config", "user.email", "faculty@example.test"]);
    await git(noCheckoutClone, ["config", "user.name", "Faculty"]);
    assert(
      (await gitResult(noCheckoutClone, ["symbolic-ref", "-q", "HEAD"])).exitCode === 1,
      "HEAD is not detached."
    );
    await git(noCheckoutClone, ["checkout", "-b", "proof/branch", "--"]);
    await writeFile(join(noCheckoutClone, trackedFile), "branch change\n");
    await commitAll(noCheckoutClone, "Normal packaged commit");
    await git(noCheckoutClone, ["commit", "--allow-empty", "-m", "Allow-empty packaged commit"]);
    await git(noCheckoutClone, ["checkout", "main", "--"]);
    await git(noCheckoutClone, ["checkout", "-B", "proof/branch", "main", "--"]);
    assert(
      (
        await git(noCheckoutClone, [
          "status",
          "--porcelain=v2",
          "--branch",
          "-z",
          "--untracked-files=all"
        ])
      )
        .toString("utf8")
        .includes("# branch.head proof/branch"),
      "Branch reset/switch was not observable in status."
    );
    assert(
      (
        await git(noCheckoutClone, ["log", "--first-parent", "--format=%H%x00%T%x00", "HEAD", "--"])
      ).includes(0),
      "First-parent log did not include commit and tree IDs."
    );
    assert(
      (await git(noCheckoutClone, ["ls-tree", "-r", "-z", "--full-tree", "HEAD"]))
        .toString("utf8")
        .includes(trackedFile),
      "Recursive tree inspection missed the tracked path."
    );

    await writeFile(join(source, "remote change with spaces.txt"), "remote update\n");
    const remoteHead = await commitAll(source, "Remote update");
    await git(source, ["push"]);
    await git(noCheckoutClone, ["fetch", "origin"]);
    assert(
      (await git(noCheckoutClone, ["rev-parse", "refs/remotes/origin/main"]))
        .toString("utf8")
        .trim() === remoteHead,
      "Fetch did not update the remote-tracking ref."
    );

    await git(normalClone, ["fetch", "origin"]);
    await git(normalClone, ["reset", "--hard", "refs/remotes/origin/main"]);
    await git(normalClone, ["config", "user.email", "faculty@example.test"]);
    await git(normalClone, ["config", "user.name", "Faculty"]);
    await writeFile(join(normalClone, "faculty commit with spaces.txt"), "faculty\n");
    const pushedHead = await commitAll(normalClone, "Upstream push proof");
    await git(normalClone, ["push"]);
    assert(
      (await git(remote, ["rev-parse", "refs/heads/main"])).toString("utf8").trim() === pushedHead,
      "Upstream push did not reach the bare remote."
    );

    await git(noCheckoutClone, ["push", "origin", "HEAD:refs/heads/review/proof"]);
    assert(
      (await git(remote, ["show-ref", "refs/heads/review/proof"])).length > 0,
      "Explicit branch push failed."
    );
    await git(noCheckoutClone, ["push", "origin", "--delete", "review/proof"]);
    assert(
      (await gitResult(remote, ["show-ref", "refs/heads/review/proof"])).exitCode === 1,
      "Remote branch deletion failed."
    );

    await writeFile(join(noCheckoutClone, trackedFile), "discard\n");
    await writeFile(join(noCheckoutClone, "untracked file with spaces.txt"), "discard\n");
    await git(noCheckoutClone, ["reset", "--hard", "HEAD"]);
    await git(noCheckoutClone, ["clean", "-fd"]);
    assert(
      (await git(noCheckoutClone, ["status", "--porcelain"])).length === 0,
      "Reset/clean did not restore the clone."
    );
  };

  const runBoundedOutputProof = async (root) => {
    const repository = join(root, "bounded output repository");
    await initializeRepository(repository);
    const input = Buffer.from("packaged-binary\u0000input\u00ff", "latin1");
    const stored = (await git(repository, ["hash-object", "-w", "--stdin"], { input }))
      .toString("utf8")
      .trim();
    assert(
      (await git(repository, ["cat-file", "blob", stored])).equals(input),
      "Buffer stdin/stdout did not round-trip."
    );
    let boundWasEnforced = false;
    try {
      await runGit({
        cwd: repository,
        args: ["cat-file", "blob", stored],
        maxOutputBytes: TINY_OUTPUT_BOUND
      });
    } catch (error) {
      boundWasEnforced = error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
    }
    assert(boundWasEnforced, "The configured Git output bound was not enforced.");
  };

  const runBinaryPatchProof = async (root) => {
    const template = join(root, "template repository with spaces");
    await initializeRepository(template);
    const baseLesson = [
      "template old",
      "stable 1",
      "stable 2",
      "stable 3",
      "stable 4",
      "stable 5",
      "stable 6",
      "stable 7",
      "student old",
      ""
    ].join("\n");
    await writeFile(join(template, "lesson text with spaces.txt"), baseLesson);
    await writeFile(join(template, "conflict.txt"), "base\n");
    await writeFile(join(template, "obsolete file.txt"), "delete me\n");
    await writeFile(join(template, "binary file.dat"), Buffer.from("00010203ff", "hex"));
    const base = await commitAll(template, "Template base");

    await git(template, ["checkout", "-b", "template-clean", "--"]);
    await writeFile(
      join(template, "lesson text with spaces.txt"),
      baseLesson.replace("template old", "template new")
    );
    await writeFile(join(template, "addition with spaces.txt"), "added\n");
    await rm(join(template, "obsolete file.txt"));
    const updatedBinary = Buffer.from("0009080706ff", "hex");
    await writeFile(join(template, "binary file.dat"), updatedBinary);
    const cleanTarget = await commitAll(template, "Clean template target");
    const cleanPatch = await git(template, [
      "diff",
      "--binary",
      "--full-index",
      base,
      cleanTarget,
      "--"
    ]);
    const patchMarkers = cleanPatch.toString("ascii");
    assert(Buffer.isBuffer(cleanPatch), "The packaged binary patch is not a Buffer.");
    assert(
      patchMarkers.includes("GIT binary patch"),
      "The canonical binary patch marker is missing."
    );
    assert(patchMarkers.includes("new file mode"), "The patch does not contain the addition.");
    assert(patchMarkers.includes("deleted file mode"), "The patch does not contain the deletion.");
    assert(
      patchMarkers.includes("lesson text with spaces.txt"),
      "The patch does not contain the text change."
    );

    await git(template, ["checkout", "main", "--"]);
    await git(template, ["checkout", "-b", "template-conflict", "--"]);
    await writeFile(join(template, "conflict.txt"), "template target\n");
    const conflictTarget = await commitAll(template, "Conflicting template target");
    const conflictPatch = await git(template, [
      "diff",
      "--binary",
      "--full-index",
      base,
      conflictTarget,
      "--"
    ]);
    await git(template, ["checkout", "main", "--"]);

    const cleanStudent = join(root, "clean student repository with spaces");
    await git(root, ["clone", "--", template, cleanStudent]);
    await git(cleanStudent, ["config", "user.email", "student@example.test"]);
    await git(cleanStudent, ["config", "user.name", "Student"]);
    await writeFile(
      join(cleanStudent, "lesson text with spaces.txt"),
      baseLesson.replace("student old", "student custom")
    );
    await commitAll(cleanStudent, "Unrelated student edit");
    assert(
      (await applyThreeWayIndexed(cleanStudent, cleanPatch)) === "applied",
      "The clean three-way patch did not apply."
    );
    assert(
      (await readFile(join(cleanStudent, "lesson text with spaces.txt"), "utf8")) ===
        baseLesson.replace("template old", "template new").replace("student old", "student custom"),
      "The clean apply did not preserve the unrelated student edit."
    );
    assert(
      (await readFile(join(cleanStudent, "binary file.dat"))).equals(updatedBinary),
      "The binary update is not byte-exact."
    );
    assert(
      (await readFile(join(cleanStudent, "addition with spaces.txt"), "utf8")) === "added\n",
      "The addition was not applied."
    );
    assert(!existsSync(join(cleanStudent, "obsolete file.txt")), "The deletion was not applied.");
    const staged = (await git(cleanStudent, ["diff", "--cached", "--name-status", "-z"])).toString(
      "utf8"
    );
    for (const expectedPath of [
      "addition with spaces.txt",
      "binary file.dat",
      "lesson text with spaces.txt",
      "obsolete file.txt"
    ]) {
      assert(
        staged.includes(expectedPath),
        `The expected staged path is missing: ${expectedPath}.`
      );
    }
    assert(
      (await git(cleanStudent, ["diff", "--name-only"])).length === 0,
      "The clean apply left unstaged changes."
    );

    const conflictStudent = join(root, "conflict student repository with spaces");
    await git(root, ["clone", "--", template, conflictStudent]);
    await git(conflictStudent, ["config", "user.email", "student@example.test"]);
    await git(conflictStudent, ["config", "user.name", "Student"]);
    await writeFile(join(conflictStudent, "conflict.txt"), "student work\n");
    const studentHead = await commitAll(conflictStudent, "Conflicting student edit");
    assert(
      (await applyThreeWayIndexed(conflictStudent, conflictPatch)) === "conflict",
      "The incompatible patch did not conflict."
    );
    const unmerged = (await git(conflictStudent, ["ls-files", "--unmerged", "-z"])).toString(
      "utf8"
    );
    assert(
      / 1\t/u.test(unmerged) && / 2\t/u.test(unmerged) && / 3\t/u.test(unmerged),
      "Index stages 1/2/3 are missing."
    );
    assert(
      (await git(conflictStudent, ["status", "--porcelain=v2", "-z"]))
        .toString("utf8")
        .startsWith("u "),
      "The porcelain conflict state is missing."
    );
    await git(conflictStudent, ["reset", "--hard", studentHead]);
    await git(conflictStudent, ["clean", "-fd"]);
    assert(
      (await git(conflictStudent, ["status", "--porcelain"])).length === 0,
      "Conflict recovery did not restore clean state."
    );
  };

  const runAuthenticationEnvironmentProof = async (root) => {
    const repository = join(root, "authentication repository with spaces");
    await initializeRepository(repository);
    const token = "graider-distinctive-fake-secret-packaged-1.2B";
    const before = {
      count: process.env.GIT_CONFIG_COUNT,
      terminalPrompt: process.env.GIT_TERMINAL_PROMPT
    };
    const authentication = createAuthenticationEnvironment(token);
    const observed = await git(
      repository,
      ["config", "--get", "http.https://github.com/.extraHeader"],
      {
        env: authentication.env,
        secrets: authentication.secrets
      }
    );
    assert(
      observed.toString("utf8") === `${authentication.secrets[2]}\n`,
      "The child did not receive the auth configuration."
    );
    assert(process.env.GIT_CONFIG_COUNT === before.count, "The parent GIT_CONFIG_COUNT changed.");
    assert(
      process.env.GIT_TERMINAL_PROMPT === before.terminalPrompt,
      "The parent prompt setting changed."
    );
    assert(authentication.env.GIT_CONFIG_VALUE_0 === "", "The credential helper was not cleared.");
    assert(authentication.env.GIT_TERMINAL_PROMPT === "0", "Terminal prompting was not disabled.");

    const withoutAuthentication = await gitResult(repository, [
      "config",
      "--get",
      "http.https://github.com/.extraHeader"
    ]);
    assert(
      withoutAuthentication.exitCode === 1,
      "The auth configuration leaked to another Git child."
    );
    const remote = "https://github.com/example/private-repository.git";
    await git(repository, ["remote", "add", "origin", remote], {
      env: authentication.env,
      secrets: authentication.secrets
    });
    assert(
      (await git(repository, ["remote", "get-url", "origin"])).toString("utf8").trim() === remote,
      "The remote URL was changed."
    );
    const localConfiguration = await git(repository, [
      "config",
      "--local",
      "--list",
      "--show-origin"
    ]);
    const retained = localConfiguration.toString("utf8");
    assert(
      authentication.secrets.every((secret) => !retained.includes(secret)),
      "A credential persisted in repository config."
    );
  };

  const liveProofRequested = process.argv.includes("--live-private");
  const runLivePrivateProof = async (root) => {
    const gateNames = [
      "GRAIDER_RUN_LIVE_GITHUB_TESTS",
      "GRAIDER_RUN_LIVE_DUGITE_GIT_TESTS",
      "GRAIDER_RUN_LIVE_DESTRUCTIVE_TESTS"
    ];
    assert(
      gateNames.every((name) => process.env[name] === "true"),
      "All destructive live-proof gates must be true."
    );
    const token = process.env.GRAIDER_GITHUB_TOKEN;
    const remote = process.env.GRAIDER_LIVE_DUGITE_REPOSITORY;
    const prefix = process.env.GRAIDER_LIVE_DUGITE_BRANCH_PREFIX;
    assert(token !== undefined && token !== "", "The live proof token is required.");
    assert(remote !== undefined && remote !== "", "The live proof repository is required.");
    assert(prefix !== undefined && prefix !== "", "The live proof branch prefix is required.");
    const parsedRemote = new URL(remote);
    assert(
      parsedRemote.protocol === "https:" &&
        parsedRemote.hostname === "github.com" &&
        parsedRemote.port === "" &&
        parsedRemote.username === "" &&
        parsedRemote.password === "" &&
        parsedRemote.pathname.endsWith(".git"),
      "The live proof requires a clean HTTPS GitHub remote."
    );
    assert(
      /^[A-Za-z0-9._/-]+\/$/u.test(prefix) && !prefix.startsWith("/") && !prefix.includes(".."),
      "The live proof branch prefix is unsafe."
    );

    const authentication = createAuthenticationEnvironment(token);
    const clone = join(root, "live private clone with spaces");
    const branch = `${prefix}${Date.now().toString(10)}-${randomUUID()}`;
    let pushed = false;
    try {
      await git(root, ["clone", "--", remote, clone], {
        env: authentication.env,
        secrets: authentication.secrets
      });
      await git(clone, ["config", "user.email", "faculty@example.test"]);
      await git(clone, ["config", "user.name", "Graider packaged proof"]);
      await git(clone, ["commit", "--allow-empty", "-m", "Graider packaged private Git proof"]);
      await git(clone, ["push", "origin", `HEAD:refs/heads/${branch}`], {
        env: authentication.env,
        secrets: authentication.secrets
      });
      pushed = true;
      await git(clone, ["fetch", "origin", `refs/heads/${branch}:refs/remotes/origin/${branch}`], {
        env: authentication.env,
        secrets: authentication.secrets
      });
      assert(
        (await git(clone, ["show-ref", `refs/remotes/origin/${branch}`])).length > 0,
        "The live proof ref was not verified."
      );
      const configuredRemote = (await git(clone, ["remote", "get-url", "origin"]))
        .toString("utf8")
        .trim();
      assert(configuredRemote === remote, "The live proof persisted a credentialed remote.");
    } finally {
      if (pushed) {
        await git(clone, ["push", "origin", "--delete", branch], {
          env: authentication.env,
          secrets: authentication.secrets
        });
      }
    }
  };

  const temporaryRoot = await mkdtemp(join(tmpdir(), "graider packaged dugite proof with spaces "));
  try {
    const versionOutput = (await git(temporaryRoot, ["--version"])).toString("utf8").trim();
    assert(
      versionOutput === EXPECTED_GIT_VERSIONS[process.platform],
      "The packaged Git version is not the selected 2.53.0 distribution."
    );
    await runBoundedOutputProof(temporaryRoot);
    await runCoreRepositoryProof(temporaryRoot);
    await runBinaryPatchProof(temporaryRoot);
    await runAuthenticationEnvironmentProof(temporaryRoot);
    if (liveProofRequested) await runLivePrivateProof(temporaryRoot);

    const safeRelativeGitPath = relative(resourcesDirectory, canonicalGitBinary)
      .split(sep)
      .join("/");
    process.stdout.write(
      `PACKAGED_DUGITE_PROOF_OK ${JSON.stringify({
        platform: process.platform,
        architecture: process.arch,
        gitVersion: versionOutput,
        gitPath: safeRelativeGitPath
      })}\n`
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true, maxRetries: 3, retryDelay: 100 });
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown packaged proof failure.";
  process.stderr.write(`PACKAGED_DUGITE_PROOF_FAILED ${message}\n`);
  process.exitCode = 1;
});
