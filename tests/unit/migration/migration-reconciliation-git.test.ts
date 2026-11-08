import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import {
  describeGitIntegration,
  removeGitFixture
} from "../../support/git/integration-fixtures.js";
import { BasicCourse, completeSyntheticMigration } from "./synthetic-migration-fixtures.js";
import {
  buildMigrationCandidate,
  STAGED_PHASE_9_BOUNDARY
} from "../../../src/migration/migration-candidate.js";
import { createMigrationGitRunners } from "../../../src/migration/migration-git.js";
import { readMigrationReconciliationSnapshot } from "../../../src/migration/migration-reconciliation-git.js";
import {
  createReconciliationRecord,
  RECONCILIATION_PATH,
  reconciliationValue
} from "../../../src/migration/migration-reconciliation-state.js";
import { addManifest } from "./migration-fixtures.js";
import type { MigrationSnapshot } from "../../../src/migration/migration-models.js";

const DIGEST_LENGTH = 64;
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const fixture = async (
  edit?: (snapshot: MigrationSnapshot) => void,
  lifecycle: "active" | "archived" = "active"
) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider reconciliation history "));
  roots.push(root);
  const runner = createMigrationGitRunners();
  const git = async (...args: string[]) => (await runner.runGit({ cwd: root, args })).trim();
  const put = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  const commit = async (message: string) => {
    await git("add", ".");
    await git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-m",
      message
    );
    return git("rev-parse", "HEAD");
  };
  await git("init", "--initial-branch=main");
  const snapshot = BasicCourse();
  edit?.(snapshot);
  for (const [file, bytes] of Object.entries(snapshot.sourceFiles)) put(file, bytes);
  const source = await commit("Source Schema 1");
  const artifacts = completeSyntheticMigration(
    BasicCourse({ sourceSha: source, sourceFiles: snapshot.sourceFiles }),
    [lifecycle]
  );
  const candidate = buildMigrationCandidate({ ...artifacts, boundary: STAGED_PHASE_9_BOUNDARY });
  if (candidate.status === "blocked") throw new Error(candidate.problems.join(" "));
  for (const file of candidate.files) put(file.path, file.content);
  const publication = await commit("Publish exact candidate");
  const read = async () =>
    readMigrationReconciliationSnapshot(root, await git("rev-parse", "HEAD"));
  return { root, source, publication, git, put, commit, read };
};

describeGitIntegration("exact published migration and journal descendant validation", () => {
  it("derives student repository scope only from exact source anchors, reviewed rosters and immutable IDs", async () => {
    const f = await fixture((snapshot) => {
      addManifest(snapshot, (manifest) => {
        manifest.repositories = manifest.repositories.filter(
          (repository) => repository.section === "001"
        );
      });
    });
    const observed = await f.read();
    expect(observed.targets).toHaveLength(1);
    expect(observed.targets[0]).toMatchObject({
      termCode: "27s1",
      sectionId: "001",
      targetId: "student001",
      mode: "individual"
    });
    expect(observed.targetAttention).toEqual([]);
  });
  it("refuses stale source anchors without student mutations or privilege inference", async () => {
    const f = await fixture((snapshot) => {
      addManifest(snapshot, (manifest) => {
        manifest.repositories = manifest.repositories.filter(
          (repository) => repository.section === "001"
        );
        manifest.source.input_fingerprint = "f".repeat(DIGEST_LENGTH);
      });
    });
    const observed = await f.read();
    expect(observed.targets).toEqual([]);
    expect(observed.targetAttention).toContain("required_student_scope_unverified");
  });
  it("refuses unproven active repository IDs while safely deferring equivalent historical evidence", async () => {
    const edit = (snapshot: MigrationSnapshot) => {
      addManifest(snapshot, (manifest) => {
        manifest.repositories = manifest.repositories.filter(
          (repository) => repository.section === "001"
        );
        reconciliationValue(manifest.repositories[0]).repository.id = 0;
      });
    };
    const active = await fixture(edit);
    expect((await active.read()).targets).toEqual([]);
    expect((await active.read()).targetAttention.length).toBeGreaterThan(0);
    const historical = await fixture(edit, "archived");
    expect((await historical.read()).targets).toEqual([]);
    expect((await historical.read()).targetAttention).toEqual([]);
  });
  it("rediscovers publication, source and permanent review audit using only shared Git history", async () => {
    const f = await fixture();
    const first = await f.read();
    expect(first.publication).toBe(f.publication);
    expect(first.source).toBe(f.source);
    const record = createReconciliationRecord(first);
    f.put(RECONCILIATION_PATH, JSON.stringify(record));
    const journal = await f.commit("Shared recovery journal");
    const second = await f.read();
    expect(second.revision).toBe(journal);
    expect(second.publication).toBe(f.publication);
    expect(second.intendedFingerprint).toBe(first.intendedFingerprint);
    expect(second.metadata.audit).toEqual(first.metadata.audit);
    expect(second.record).toEqual(record);
  });
  it("rejects unexpected domain changes even when a subsequent commit restores the published bytes", async () => {
    const f = await fixture();
    const original = fs.readFileSync(path.join(f.root, "course.yml"), "utf8");
    f.put("course.yml", `${original}\n# unexpected change\n`);
    await f.commit("Unauthorized source advance");
    f.put("course.yml", original);
    await f.commit("Restore original bytes");
    await expect(f.read()).rejects.toThrow();
  });
  it("rejects merge descendants even if their final tree equals the publication", async () => {
    const f = await fixture();
    await f.git("checkout", "-b", "other");
    await f.git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "--allow-empty",
      "-m",
      "Other history"
    );
    await f.git("checkout", "main");
    await f.git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "merge",
      "--no-ff",
      "other",
      "-m",
      "Merge"
    );
    await expect(f.read()).rejects.toThrow();
  });
  it("rejects tampered or foreign journal bindings and journal removal", async () => {
    const f = await fixture();
    const record = createReconciliationRecord(await f.read());
    f.put(
      RECONCILIATION_PATH,
      JSON.stringify({
        ...record,
        binding: { ...record.binding, repositoryId: record.binding.repositoryId + 1 }
      })
    );
    await f.commit("Foreign journal");
    await expect(f.read()).rejects.toThrow();
    fs.rmSync(path.join(f.root, RECONCILIATION_PATH));
    await f.commit("Remove journal");
    await expect(f.read()).rejects.toThrow();
  });
  it("does not accept an asserted Ready flag without complete verified operations", async () => {
    const f = await fixture();
    const record = createReconciliationRecord(await f.read());
    record.status = "ready";
    f.put(RECONCILIATION_PATH, JSON.stringify(record));
    await f.commit("Forged readiness");
    await expect(f.read()).rejects.toThrow();
  });
});
