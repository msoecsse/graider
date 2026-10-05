import { execFile } from "node:child_process";
import {
  access,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { setupEnvironment } from "dugite";
import { afterEach, describe, expect, it } from "vitest";
import {
  BundledGitSpikeError,
  applyThreeWayIndexed,
  embeddedGitBinary,
  gitHubAuthenticationEnvironment,
  requireBundledGitSuccess,
  runBundledGit,
  type BundledGitResult
} from "./dugite-executor.js";

const executeFile = promisify(execFile);
const temporaryDirectories: string[] = [];
const MACH_O_ARM64_HEADER = Buffer.from("cffaedfe", "hex");
const MACH_O_ARM64_CPU_TYPE = Number.parseInt("0100000c", 16);
const PE_HEADER_OFFSET_LOCATION = Number.parseInt("3c", 16);
const PE_X64_MACHINE_TYPE = Number.parseInt("8664", 16);
const MODULE_BUCKET_COUNT = 10;
const portablePath = (value: string): string => value.split("\\").join("/");
const bundledOnlyEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { ...process.env, PATH: "" };
  delete environment.LOCAL_GIT_DIRECTORY;
  delete environment.GIT_EXEC_PATH;
  return environment;
};

const gitResult = async (
  cwd: string,
  args: readonly string[],
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly input?: Uint8Array;
    readonly onSpawn?: Parameters<typeof runBundledGit>[0]["onSpawn"];
  } = {}
): Promise<BundledGitResult> =>
  await runBundledGit({
    cwd,
    args,
    env: options.env ?? bundledOnlyEnvironment(),
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.onSpawn === undefined ? {} : { onSpawn: options.onSpawn })
  });

const git = async (
  cwd: string,
  args: readonly string[],
  options: Parameters<typeof gitResult>[2] = {}
): Promise<Buffer> => requireBundledGitSuccess(await gitResult(cwd, args, options)).stdout;

const createTemporaryRoot = async (label: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), `graider dugite ${label} `));
  temporaryDirectories.push(root);
  return root;
};

const initializeRepository = async (repository: string): Promise<void> => {
  await mkdir(repository, { recursive: true });
  await git(repository, ["init", "--initial-branch=main"]);
  await git(repository, ["config", "user.email", "faculty@example.test"]);
  await git(repository, ["config", "user.name", "Faculty"]);
};

const commitAll = async (repository: string, message: string): Promise<string> => {
  await git(repository, ["add", "--all", "--"]);
  await git(repository, ["commit", "-m", message]);
  return (await git(repository, ["rev-parse", "HEAD"])).toString("utf8").trim();
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

describe("Dugite bundled Git executor proof", () => {
  it("resolves and executes the packaged Git binary without PATH discovery", async () => {
    const binary = embeddedGitBinary();
    let spawnedFile = "";
    let spawnedArguments: readonly string[] = [];

    await expect(access(binary)).resolves.toBeUndefined();
    expect(portablePath(binary)).toContain("node_modules/dugite/git/");
    const executableBytes = await readFile(binary);
    if (process.platform === "darwin" && process.arch === "arm64") {
      expect(executableBytes.subarray(0, MACH_O_ARM64_HEADER.length)).toEqual(MACH_O_ARM64_HEADER);
      expect(executableBytes.readUInt32LE(MACH_O_ARM64_HEADER.length)).toBe(MACH_O_ARM64_CPU_TYPE);
    }
    if (process.platform === "win32" && process.arch === "x64") {
      const portableExecutableOffset = executableBytes.readUInt32LE(PE_HEADER_OFFSET_LOCATION);
      expect(executableBytes.subarray(0, 2).toString("ascii")).toBe("MZ");
      expect(
        executableBytes.subarray(portableExecutableOffset, portableExecutableOffset + 4)
      ).toEqual(Buffer.from("PE\u0000\u0000", "binary"));
      expect(executableBytes.readUInt16LE(portableExecutableOffset + 4)).toBe(PE_X64_MACHINE_TYPE);
    }

    const result = await runBundledGit({
      args: ["--version"],
      cwd: process.cwd(),
      env: bundledOnlyEnvironment(),
      onSpawn: (child) => {
        spawnedFile = child.spawnfile;
        spawnedArguments = child.spawnargs;
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString("utf8")).toMatch(/^git version /u);
    expect(await realpath(spawnedFile)).toBe(await realpath(binary));
    expect(spawnedArguments).toContain("--version");
  });

  it("supports bounded Buffer output, Buffer stdin, and AbortSignal cancellation", async () => {
    const root = await createTemporaryRoot("process seam");
    await initializeRepository(root);
    const input = Buffer.from("binary\u0000input\u00ff", "latin1");
    const hash = await git(root, ["hash-object", "--stdin"], { input });
    const stored = await git(root, ["hash-object", "-w", "--stdin"], { input });
    const roundTrip = await git(root, ["cat-file", "blob", stored.toString("utf8").trim()]);

    expect(hash).toEqual(stored);
    expect(roundTrip).toEqual(input);

    await expect(
      runBundledGit({
        cwd: root,
        args: ["cat-file", "blob", stored.toString("utf8").trim()],
        env: bundledOnlyEnvironment(),
        maxOutputBytes: 4
      })
    ).rejects.toMatchObject({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });

    await expect(
      runBundledGit({
        cwd: root,
        args: ["--version"],
        env: bundledOnlyEnvironment(),
        signal: AbortSignal.abort()
      })
    ).rejects.toMatchObject({ code: "ABORT_ERR" });
  });

  it("resolves app.asar modules to an app.asar.unpacked Git payload", async () => {
    const root = await createTemporaryRoot("asar resolution");
    const installedPackageRoot = join(embeddedGitBinary(), "..", "..", "..");
    const asarPackageRoot = join(root, "app.asar", "node_modules", "dugite");
    const unpackedPackageRoot = join(root, "app.asar.unpacked", "node_modules", "dugite");
    await mkdir(asarPackageRoot, { recursive: true });
    await mkdir(unpackedPackageRoot, { recursive: true });
    await cp(join(installedPackageRoot, "build"), join(asarPackageRoot, "build"), {
      recursive: true
    });
    await symlink(
      join(installedPackageRoot, "git"),
      join(unpackedPackageRoot, "git"),
      process.platform === "win32" ? "junction" : "dir"
    );
    const requireFromAsar = createRequire(join(asarPackageRoot, "spike.cjs"));
    const simulatedDugite = requireFromAsar(join(asarPackageRoot, "build", "lib", "index.js")) as {
      readonly resolveGitBinary: () => string;
      readonly exec: (
        args: string[],
        cwd: string,
        options: { readonly encoding: "buffer"; readonly env: NodeJS.ProcessEnv }
      ) => Promise<BundledGitResult>;
    };

    expect(await realpath(simulatedDugite.resolveGitBinary())).toBe(
      await realpath(
        join(unpackedPackageRoot, "git", process.platform === "win32" ? "cmd/git.exe" : "bin/git")
      )
    );
    const result = await simulatedDugite.exec(["--version"], root, {
      encoding: "buffer",
      env: bundledOnlyEnvironment()
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString("utf8")).toMatch(/^git version /u);
  });

  it("executes core repository mechanics in paths with spaces without system Git", async () => {
    const root = await createTemporaryRoot("core mechanics");
    const source = join(root, "source with spaces");
    const remote = join(root, "bare remote with spaces.git");
    const normalClone = join(root, "normal clone with spaces");
    const noCheckoutClone = join(root, "no checkout clone with spaces");
    await initializeRepository(source);
    await writeFile(join(source, "course file.txt"), "base\n");
    const base = await commitAll(source, "Bundled Git base");

    await git(root, ["init", "--bare", remote]);
    await git(source, ["remote", "add", "origin", remote]);
    await git(source, ["push", "--set-upstream", "origin", "main"]);
    await git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    await git(root, ["clone", "--", remote, normalClone]);
    await git(root, ["clone", "--no-checkout", "--", remote, noCheckoutClone]);

    await expect(readFile(join(normalClone, "course file.txt"), "utf8")).resolves.toBe("base\n");
    await expect(access(join(noCheckoutClone, "course file.txt"))).rejects.toBeDefined();
    expect(
      (await git(noCheckoutClone, ["symbolic-ref", "refs/remotes/origin/HEAD"]))
        .toString("utf8")
        .trim()
    ).toBe("refs/remotes/origin/main");

    await git(noCheckoutClone, ["checkout", "-B", "main", "refs/remotes/origin/main", "--"]);
    await git(noCheckoutClone, ["checkout", "--detach", base]);
    await git(noCheckoutClone, ["checkout", "-b", "proof branch", "--"]).then(
      () => {
        throw new Error("Git should reject a branch containing a space.");
      },
      () => undefined
    );
    await git(noCheckoutClone, ["checkout", "-b", "proof/branch", "--"]);
    await writeFile(join(noCheckoutClone, "course file.txt"), "branch change\n");
    await commitAll(noCheckoutClone, "Branch commit");
    await git(noCheckoutClone, ["commit", "--allow-empty", "-m", "Allow empty proof"]);
    await git(noCheckoutClone, ["checkout", "main", "--"]);
    await git(noCheckoutClone, ["checkout", "-B", "proof/branch", "main", "--"]);

    const status = await git(noCheckoutClone, [
      "status",
      "--porcelain=v2",
      "--branch",
      "-z",
      "--untracked-files=all"
    ]);
    expect(status.toString("utf8")).toContain("# branch.head proof/branch");
    const firstParent = await git(noCheckoutClone, [
      "log",
      "--first-parent",
      "--format=%H%x00%T%x00",
      "HEAD",
      "--"
    ]);
    expect(firstParent.includes(0)).toBe(true);
    const tree = await git(noCheckoutClone, ["ls-tree", "-r", "-z", "--full-tree", "HEAD"]);
    expect(tree.toString("utf8")).toContain("course file.txt");

    await git(noCheckoutClone, ["push", "origin", "HEAD:refs/heads/review/proof"]);
    expect((await git(remote, ["show-ref", "refs/heads/review/proof"])).length).toBeGreaterThan(0);
    await git(noCheckoutClone, ["push", "origin", "--delete", "review/proof"]);
    expect((await gitResult(remote, ["show-ref", "refs/heads/review/proof"])).exitCode).toBe(1);

    await writeFile(join(noCheckoutClone, "course file.txt"), "discard me\n");
    await writeFile(join(noCheckoutClone, "untracked file.txt"), "discard me\n");
    await git(noCheckoutClone, ["reset", "--hard", "HEAD"]);
    await git(noCheckoutClone, ["clean", "-fd"]);
    expect((await git(noCheckoutClone, ["status", "--porcelain"])).length).toBe(0);

    await writeFile(join(normalClone, "interoperable.txt"), "written by Dugite\n");
    await git(normalClone, ["config", "user.email", "faculty@example.test"]);
    await git(normalClone, ["config", "user.name", "Faculty"]);
    await commitAll(normalClone, "Dugite mutation");
    await git(normalClone, ["push"]);
    await git(normalClone, ["fsck", "--full"]);
  });

  it.runIf(process.platform === "darwin")(
    "opens and mutates a canonical system-Git repository without changing its format",
    async () => {
      const root = await createTemporaryRoot("canonical interoperability");
      const repository = join(root, "canonical repository with spaces");
      await executeFile("/usr/bin/git", ["init", repository]);
      await executeFile("/usr/bin/git", [
        "-C",
        repository,
        "config",
        "user.email",
        "faculty@example.test"
      ]);
      await executeFile("/usr/bin/git", ["-C", repository, "config", "user.name", "Faculty"]);
      await writeFile(join(repository, "canonical.txt"), "canonical\n");
      await executeFile("/usr/bin/git", ["-C", repository, "add", "--", "canonical.txt"]);
      await executeFile("/usr/bin/git", ["-C", repository, "commit", "-m", "Canonical commit"]);

      const discoveredRoot = (await git(repository, ["rev-parse", "--show-toplevel"]))
        .toString("utf8")
        .trim();
      expect(await realpath(discoveredRoot)).toBe(await realpath(repository));
      await writeFile(join(repository, "dugite.txt"), "bundled mutation\n");
      await commitAll(repository, "Bundled Git mutation");

      await executeFile("/usr/bin/git", ["-C", repository, "fsck", "--full"]);
      expect(
        (await executeFile("/usr/bin/git", ["-C", repository, "show", "HEAD:dugite.txt"])).stdout
      ).toBe("bundled mutation\n");
    }
  );

  it("generates and applies canonical binary patches with clean and conflict index semantics", async () => {
    const root = await createTemporaryRoot("binary patch");
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
    await writeFile(join(template, "lesson.txt"), baseLesson);
    await writeFile(join(template, "conflict.txt"), "base\n");
    await writeFile(join(template, "obsolete.txt"), "delete me\n");
    await writeFile(join(template, "binary.dat"), Buffer.from("00010203ff", "hex"));
    const base = await commitAll(template, "Template base");

    await git(template, ["checkout", "-b", "template-clean", "--"]);
    await writeFile(
      join(template, "lesson.txt"),
      baseLesson.replace("template old", "template new")
    );
    await writeFile(join(template, "addition.txt"), "added\n");
    await rm(join(template, "obsolete.txt"));
    const updatedBinary = Buffer.from("0009080706ff", "hex");
    await writeFile(join(template, "binary.dat"), updatedBinary);
    const cleanTarget = await commitAll(template, "Clean template target");
    const cleanPatch = await git(template, [
      "diff",
      "--binary",
      "--full-index",
      base,
      cleanTarget,
      "--"
    ]);
    expect(Buffer.isBuffer(cleanPatch)).toBe(true);
    expect(cleanPatch.toString("ascii")).toContain("GIT binary patch");

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
    const cleanStudent = join(root, "clean student with spaces");
    await git(root, ["clone", "--", template, cleanStudent]);
    await git(cleanStudent, ["config", "user.email", "student@example.test"]);
    await git(cleanStudent, ["config", "user.name", "Student"]);
    await writeFile(
      join(cleanStudent, "lesson.txt"),
      baseLesson.replace("student old", "student custom")
    );
    await commitAll(cleanStudent, "Student work");

    const applied = await applyThreeWayIndexed({
      cwd: cleanStudent,
      patch: cleanPatch,
      env: bundledOnlyEnvironment()
    });
    expect(applied).toEqual({ kind: "applied" });
    expect(await readFile(join(cleanStudent, "lesson.txt"), "utf8")).toBe(
      baseLesson.replace("template old", "template new").replace("student old", "student custom")
    );
    expect(await readFile(join(cleanStudent, "binary.dat"))).toEqual(updatedBinary);
    await expect(readFile(join(cleanStudent, "addition.txt"), "utf8")).resolves.toBe("added\n");
    await expect(access(join(cleanStudent, "obsolete.txt"))).rejects.toBeDefined();
    const staged = (await git(cleanStudent, ["diff", "--cached", "--name-status", "-z"]))
      .toString("utf8")
      .split("\u0000");
    expect(staged).toEqual([
      "A",
      "addition.txt",
      "M",
      "binary.dat",
      "M",
      "lesson.txt",
      "D",
      "obsolete.txt",
      ""
    ]);
    expect((await git(cleanStudent, ["diff", "--name-only"])).length).toBe(0);

    const conflictStudent = join(root, "conflict student with spaces");
    await git(root, ["clone", "--", template, conflictStudent]);
    await git(conflictStudent, ["config", "user.email", "student@example.test"]);
    await git(conflictStudent, ["config", "user.name", "Student"]);
    await writeFile(join(conflictStudent, "conflict.txt"), "student work\n");
    const studentHead = await commitAll(conflictStudent, "Conflicting student work");
    const conflict = await applyThreeWayIndexed({
      cwd: conflictStudent,
      patch: conflictPatch,
      env: bundledOnlyEnvironment()
    });
    expect(conflict).toEqual({ kind: "conflict" });
    expect((await git(conflictStudent, ["ls-files", "--unmerged", "-z"])).length).toBeGreaterThan(
      0
    );
    expect(
      (await git(conflictStudent, ["status", "--porcelain=v2", "-z"]))
        .toString("utf8")
        .startsWith("u ")
    ).toBe(true);
    await git(conflictStudent, ["reset", "--hard", studentHead]);
    await git(conflictStudent, ["clean", "-fd"]);
    expect((await git(conflictStudent, ["status", "--porcelain"])).length).toBe(0);
  });

  it("passes operation-scoped authentication configuration without leaking or persisting it", async () => {
    const root = await createTemporaryRoot("auth environment");
    await initializeRepository(root);
    const token = "graider-distinctive-fake-secret-1.2A";
    const originalParentValues = {
      count: process.env.GIT_CONFIG_COUNT,
      terminalPrompt: process.env.GIT_TERMINAL_PROMPT
    };
    const authentication = gitHubAuthenticationEnvironment(token, bundledOnlyEnvironment());
    let spawnedArguments: readonly string[] = [];
    const observed = await git(root, ["config", "--get", "http.https://github.com/.extraHeader"], {
      env: authentication.env,
      onSpawn: (child) => {
        spawnedArguments = child.spawnargs;
      }
    });

    expect(observed.toString("utf8")).toBe(`${authentication.secrets[2]}\n`);
    expect(spawnedArguments.join("\u0000")).not.toContain(token);
    expect(process.env.GIT_CONFIG_COUNT).toBe(originalParentValues.count);
    expect(process.env.GIT_TERMINAL_PROMPT).toBe(originalParentValues.terminalPrompt);
    expect(authentication.env.GIT_CONFIG_VALUE_0).toBe("");
    expect(authentication.env.GIT_TERMINAL_PROMPT).toBe("0");

    const configured = setupEnvironment(authentication.env, {});
    expect(configured.gitLocation).toBe(embeddedGitBinary());
    expect(portablePath(configured.env.GIT_EXEC_PATH ?? "")).toContain("node_modules/dugite/git/");
    if (process.platform !== "win32") {
      expect(configured.env.GIT_CONFIG_SYSTEM).toContain("node_modules/dugite/git/etc/gitconfig");
    }

    const remote = "https://github.com/example/private-repository.git";
    await git(root, ["remote", "add", "origin", remote], { env: authentication.env });
    expect((await git(root, ["remote", "get-url", "origin"])).toString("utf8").trim()).toBe(remote);
    const localConfiguration = await git(root, ["config", "--local", "--list", "--show-origin"]);
    expect(localConfiguration.toString("utf8")).not.toContain(token);
    expect(localConfiguration.toString("utf8")).not.toContain(authentication.secrets[1]);

    const rawFailure: BundledGitResult = {
      exitCode: 128,
      stdout: Buffer.from(`stdout ${token}`),
      stderr: Buffer.from(`stderr ${authentication.secrets[2]}`)
    };
    let safeFailure: unknown;
    try {
      requireBundledGitSuccess(rawFailure, authentication.secrets);
    } catch (error) {
      safeFailure = error;
    }
    expect(safeFailure).toBeInstanceOf(BundledGitSpikeError);
    expect(String(safeFailure)).not.toContain(token);
    expect(JSON.stringify(safeFailure)).not.toContain(token);
    expect(String((safeFailure as { readonly cause?: unknown }).cause)).not.toContain(token);
    expect(String((safeFailure as { readonly cause?: unknown }).cause)).toContain("[REDACTED]");
  });

  it("handles a nontrivial repository without a change in execution strategy", async () => {
    const root = await createTemporaryRoot("performance sanity");
    const repository = join(root, "representative repository");
    await initializeRepository(repository);
    const fileCount = 200;
    const commitCount = 20;
    await Promise.all(
      Array.from({ length: fileCount }, async (_, index) => {
        const folder = join(repository, `module ${String(index % MODULE_BUCKET_COUNT)}`);
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, `file ${String(index)}.txt`), `content ${String(index)}\n`);
      })
    );
    await commitAll(repository, "Representative tree");
    for (let index = 0; index < commitCount; index += 1) {
      await writeFile(join(repository, "history.txt"), `revision ${String(index)}\n`);
      await commitAll(repository, `History ${String(index)}`);
    }

    const clone = join(root, "representative clone with spaces");
    await git(root, ["clone", "--", repository, clone]);
    expect((await git(clone, ["status", "--porcelain"])).length).toBe(0);
    const entries = (await git(clone, ["ls-tree", "-r", "--name-only", "HEAD"])).toString("utf8");
    expect(entries.trim().split("\n")).toHaveLength(fileCount + 1);
    expect(
      (await git(clone, ["log", `--max-count=${String(commitCount)}`, "--format=%H", "HEAD", "--"]))
        .toString("utf8")
        .trim()
        .split("\n")
    ).toHaveLength(commitCount);
  });

  it("operates on both SHA-1 and local SHA-256 object formats", async () => {
    const root = await createTemporaryRoot("object formats");
    const sha256Repository = join(root, "sha256 repository with spaces");
    await mkdir(sha256Repository);
    await git(sha256Repository, ["init", "--object-format=sha256", "--initial-branch=main"]);
    await git(sha256Repository, ["config", "user.email", "faculty@example.test"]);
    await git(sha256Repository, ["config", "user.name", "Faculty"]);
    await writeFile(join(sha256Repository, "sha256.txt"), "sha256\n");
    const commit = await commitAll(sha256Repository, "SHA-256 commit");
    const tree = (await git(sha256Repository, ["rev-parse", "HEAD^{tree}"]))
      .toString("utf8")
      .trim();

    expect(commit).toMatch(/^[0-9a-f]{64}$/u);
    expect(tree).toMatch(/^[0-9a-f]{64}$/u);
    expect((await git(sha256Repository, ["status", "--porcelain"])).length).toBe(0);
    expect((await git(sha256Repository, ["ls-tree", "-r", "HEAD"])).toString("utf8")).toContain(
      "sha256.txt"
    );
  });
});
