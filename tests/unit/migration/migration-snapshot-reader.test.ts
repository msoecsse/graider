import {
  describeGitIntegration,
  removeGitFixture
} from "../../support/git/integration-fixtures.js";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { createDugiteGitRunners } from "../../../src/git/dugite-git-runners.js";
import {
  readSchemaV1MigrationAnalysis,
  readMigrationGitHistory,
  readRuntimeMigrationManifests
} from "../../../src/migration/migration-snapshot-reader.js";
import {
  fixture,
  addManifest,
  copyFixtureFiles,
  SHA,
  manifestPath,
  putTerm,
  term
} from "./migration-fixtures.js";

// Runtime evidence rejects symlinked ancestors; macOS tmpdir() may traverse /var.
const TEMP_DIRECTORY = fs.realpathSync(tmpdir());
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const git = (root: string, args: string[], input?: string) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    ...(input === undefined ? {} : { input })
  }).trim();
const createRepo = () => {
  const root = fs.mkdtempSync(path.join(TEMP_DIRECTORY, "graider-migration-read-"));
  roots.push(root);
  const sourceRoot = path.join(root, "source");
  fs.mkdirSync(sourceRoot);
  git(sourceRoot, ["init", "--quiet"]);
  git(sourceRoot, ["config", "user.email", "migration-test@example.invalid"]);
  git(sourceRoot, ["config", "user.name", "Migration Test"]);
  const input = fixture();
  addManifest(input);
  copyFixtureFiles(input, sourceRoot);
  git(sourceRoot, ["add", "."]);
  git(sourceRoot, ["commit", "--quiet", "-m", "initial"]);
  const sha = git(sourceRoot, ["rev-parse", "HEAD"]);
  return { root, sourceRoot, input, sha };
};
const treeBytes = (root: string): Record<string, string> => {
  const result: Record<string, string> = {};
  const walk = (relative: string) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile())
        result[file] = fs.readFileSync(path.join(root, file)).toString("base64");
      else result[file] = fs.readlinkSync(path.join(root, file));
    }
  };
  walk("");
  return result;
};

describeGitIntegration("exact-revision migration reader", () => {
  it("ignores dirty working files and proves zero filesystem/Git/provider/journal mutations", async () => {
    const f = createRepo();
    const runtimeRoot = path.join(f.root, "runtime");
    fs.mkdirSync(runtimeRoot);
    fs.writeFileSync(path.join(f.sourceRoot, "course.yml"), "malformed worktree");
    const before = treeBytes(f.root);
    const requests: Array<readonly string[]> = [];
    const mutations = {
      commit: vi.fn(),
      push: vi.fn(),
      github: vi.fn(),
      team: vi.fn(),
      invitation: vi.fn(),
      permission: vi.fn(),
      journal: vi.fn()
    };
    const writes = [
      vi.spyOn(fs, "writeFileSync"),
      vi.spyOn(fs, "mkdirSync"),
      vi.spyOn(fs, "copyFileSync"),
      vi.spyOn(fs, "renameSync"),
      vi.spyOn(fs, "unlinkSync")
    ];
    const runners = createDugiteGitRunners({
      onRequest: (request) => {
        requests.push(request.args);
      }
    });
    const report = await readSchemaV1MigrationAnalysis(
      {
        binding: { ...f.input.binding, sourceCommitSha: f.sha },
        sourceRoot: f.sourceRoot,
        runtimeRoot,
        runtimeCoverage: "machine_local",
        trustedIdentities: f.input.trustedIdentities,
        ...{ mutations }
      },
      runners
    );
    try {
      expect(report.validatedMigrationFacts).toBe(true);
      expect(report.source.sourceCommitSha).toBe(f.sha);
      expect(report.source.repositoryId).toBe(f.input.binding.repositoryId);
      expect(report.assignments[0]?.manifests[0]?.state).toBe("loaded");
      expect(report.assignments[0]?.manifests[1]?.state).toBe("missing");
      expect(treeBytes(f.root)).toEqual(before);
      for (const write of writes) expect(write).not.toHaveBeenCalled();
      const commands = requests.map((args) => args[0]);
      expect(commands.length).toBeGreaterThan(0);
      expect(
        commands.every((command) =>
          ["rev-parse", "ls-tree", "show", "rev-list", "for-each-ref"].includes(command ?? "")
        )
      ).toBe(true);
      for (const mutation of Object.values(mutations)) expect(mutation).not.toHaveBeenCalled();
      expect(commands).not.toContain("commit");
      expect(commands).not.toContain("push");
      expect(commands).not.toContain("fetch");
    } finally {
      writes.forEach((write) => {
        write.mockRestore();
      });
    }
  });
  it("collects real Git introduction evidence as a proposed order", async () => {
    const f = createRepo();
    putTerm(f.input, { ...term, term: { ...term.term, code: "26s3" } });
    copyFixtureFiles(f.input, f.sourceRoot);
    git(f.sourceRoot, ["add", "."]);
    git(f.sourceRoot, ["commit", "--quiet", "-m", "later-created academic-earlier term"]);
    const sha = git(f.sourceRoot, ["rev-parse", "HEAD"]);
    const report = await readSchemaV1MigrationAnalysis({
      binding: { ...f.input.binding, sourceCommitSha: sha },
      sourceRoot: f.sourceRoot,
      runtimeCoverage: "not_applicable"
    });
    expect(report.termCreationOrder).toMatchObject({
      classification: "requires_confirmation",
      value: ["27s1", "26s3"]
    });
  });
  it("reads runtime manifests separately without seeding or creating any files", async () => {
    const f = createRepo();
    const runtimeRoot = path.join(f.root, "runtime");
    fs.mkdirSync(path.dirname(path.join(runtimeRoot, manifestPath)), { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, manifestPath), "invalid runtime manifest");
    const before = treeBytes(f.root);
    const report = await readSchemaV1MigrationAnalysis({
      binding: { ...f.input.binding, sourceCommitSha: f.sha },
      sourceRoot: f.sourceRoot,
      runtimeRoot,
      runtimeCoverage: "machine_local"
    });
    expect(report.assignments[0]?.manifests.map((manifest) => manifest.state)).toEqual([
      "loaded",
      "invalid"
    ]);
    expect(report.assignments[0]?.applyState).toBe("ambiguous");
    expect(treeBytes(f.root)).toEqual(before);
  });
  it("unavailable runtime evidence is Needs attention", async () => {
    const f = createRepo();
    const runtimeRoot = path.join(f.root, "runtime");
    fs.mkdirSync(runtimeRoot);
    fs.symlinkSync(f.sourceRoot, path.join(runtimeRoot, "terms"), "dir");
    const report = await readSchemaV1MigrationAnalysis({
      binding: { ...f.input.binding, sourceCommitSha: f.sha },
      sourceRoot: f.sourceRoot,
      runtimeRoot,
      runtimeCoverage: "machine_local"
    });
    expect(report.runtimeCoverage).toBe("unavailable");
    expect(report.status).toBe("needs_attention");
  });
  it("uses the same native canonical root as the workspace when legacy realpath retains an alias", async () => {
    const f = createRepo();
    // Model Windows' legacy 8.3 path spelling without requiring Win32 on this host.
    const legacy = vi.spyOn(fs, "realpathSync").mockReturnValue(path.join(f.root, "SOURCE~1"));
    try {
      const report = await readSchemaV1MigrationAnalysis({
        binding: { ...f.input.binding, sourceCommitSha: f.sha },
        sourceRoot: f.sourceRoot,
        runtimeCoverage: "not_applicable"
      });
      expect(report.validatedMigrationFacts).toBe(true);
    } finally {
      legacy.mockRestore();
    }
  });
  it("still rejects a source directory below the exact repository root", async () => {
    const f = createRepo();
    const nested = path.join(f.sourceRoot, "nested");
    fs.mkdirSync(nested);
    const report = await readSchemaV1MigrationAnalysis({
      binding: { ...f.input.binding, sourceCommitSha: f.sha },
      sourceRoot: nested,
      runtimeCoverage: "not_applicable"
    });
    expect(report.status).toBe("blocked");
    expect(report.validatedMigrationFacts).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "source_read_failure" })])
    );
  });
  it("does not inspect a source if the exact SHA is invalid", async () => {
    const runGit = vi.fn();
    const runGitBinary = vi.fn();
    const input = fixture();
    const report = await readSchemaV1MigrationAnalysis(
      {
        binding: { ...input.binding, sourceCommitSha: "HEAD" },
        sourceRoot: "/does-not-exist",
        runtimeCoverage: "unavailable"
      },
      { runGit, runGitBinary }
    );
    expect(report.status).toBe("blocked");
    expect(runGit).not.toHaveBeenCalled();
    expect(runGitBinary).not.toHaveBeenCalled();
  });
  it("blocks unavailable exact revisions and non-regular source entries", async () => {
    const f = createRepo();
    expect(
      (
        await readSchemaV1MigrationAnalysis({
          binding: f.input.binding,
          sourceRoot: f.sourceRoot,
          runtimeCoverage: "not_applicable"
        })
      ).status
    ).toBe("blocked");
    // The contract rejects a non-regular Git tree entry, even on a host that
    // cannot check out symlinks. Create that object/index state without checkout.
    const linkBlob = git(f.sourceRoot, ["hash-object", "-w", "--stdin"], "course.yml");
    git(f.sourceRoot, ["update-index", "--add", "--cacheinfo", `120000,${linkBlob},link.yml`]);
    git(f.sourceRoot, ["commit", "--quiet", "-m", "symlink"]);
    expect(git(f.sourceRoot, ["ls-tree", "HEAD", "--", "link.yml"])).toMatch(/^120000 blob /u);
    const report = await readSchemaV1MigrationAnalysis({
      binding: { ...f.input.binding, sourceCommitSha: git(f.sourceRoot, ["rev-parse", "HEAD"]) },
      sourceRoot: f.sourceRoot,
      runtimeCoverage: "not_applicable"
    });
    expect(report.status).toBe("blocked");
    expect(report.validatedMigrationFacts).toBe(false);
  });
  it("rejects runtime storage inside source", async () => {
    const f = createRepo();
    const report = await readSchemaV1MigrationAnalysis({
      binding: { ...f.input.binding, sourceCommitSha: f.sha },
      sourceRoot: f.sourceRoot,
      runtimeRoot: path.join(f.sourceRoot, "runtime"),
      runtimeCoverage: "machine_local"
    });
    expect(report.status).toBe("blocked");
  });
  it("missing Git history is explicitly incomplete and never guessed", async () => {
    const history = await readMigrationGitHistory({ root: "/none", listTree: vi.fn() }, SHA, () =>
      Promise.reject(new Error("missing history"))
    );
    expect(history?.complete).toBe(false);
  });
  it("shallow history cannot establish creation order", async () => {
    const history = await readMigrationGitHistory({ root: "/none", listTree: vi.fn() }, SHA, () =>
      Promise.resolve("true\n")
    );
    expect(history?.complete).toBe(false);
  });
  it("replacement history is incomplete and public evidence snapshots are immutable", async () => {
    const history = await readMigrationGitHistory({ root: "/none", listTree: vi.fn() }, SHA, () =>
      Promise.resolve("refs/replace/test\n")
    );
    expect(history?.complete).toBe(false);
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history?.commits)).toBe(true);
    const root = fs.mkdtempSync(path.join(TEMP_DIRECTORY, "graider-migration-frozen-"));
    roots.push(root);
    expect(Object.isFrozen(readRuntimeMigrationManifests(root))).toBe(true);
  });
  it("missing runtime root remains missing and is never created", () => {
    const root = fs.mkdtempSync(path.join(TEMP_DIRECTORY, "graider-migration-runtime-"));
    roots.push(root);
    const target = path.join(root, "missing");
    expect(readRuntimeMigrationManifests(target)).toEqual({});
    expect(fs.existsSync(target)).toBe(false);
  });
});
