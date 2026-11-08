import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse, stringify } from "yaml";
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
import {
  readMigrationReconciliationSnapshot,
  readMigrationHistorySnapshot
} from "../../../src/migration/migration-reconciliation-git.js";
import {
  createReconciliationRecord,
  RECONCILIATION_PATH,
  reconciliationValue,
  RECONCILIATION_STEPS,
  createFreshReconciliationRecord
} from "../../../src/migration/migration-reconciliation-state.js";
import { addManifest } from "./migration-fixtures.js";
import type { MigrationSnapshot } from "../../../src/migration/migration-models.js";
import { prepareCourseLifecycleChange } from "../../../src/courses/course-lifecycle-metadata.js";
import { rawTermConfigV2Schema } from "../../../src/config/config-schemas.js";
import { migrationMetadataSchema } from "../../../src/migration/migration-candidate-schemas.js";

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
  const inspect = async () => readMigrationHistorySnapshot(root, await git("rev-parse", "HEAD"));
  const replan = async (actor?: number) => {
    const current = await inspect();
    const record = createFreshReconciliationRecord(
      current,
      actor ?? current.course.fallback_administrator.github_user_id
    );
    put(RECONCILIATION_PATH, JSON.stringify(record));
    await commit("Explicit current reconciliation plan");
    return read();
  };
  return { root, source, publication, git, put, commit, read, inspect, replan };
};

describeGitIntegration("exact published migration and journal descendant validation", () => {
  it("preserves permanent history after Ready and a supported archive commit", async () => {
    const f = await fixture(undefined, "archived");
    const published = await f.read();
    const record = createReconciliationRecord(published);
    record.status = "ready";
    // Synthetic journal mechanics only; independent operational verification is tested separately.
    record.steps = RECONCILIATION_STEPS.map((step) => ({
      step,
      status: "verified",
      reasons: [],
      resources: []
    }));
    f.put(RECONCILIATION_PATH, JSON.stringify(record));
    await f.commit("Synthetic Ready journal");
    expect((await f.read()).record?.status).toBe("ready");
    expect(
      prepareCourseLifecycleChange(
        f.root,
        published.course.github.organization,
        reconciliationValue(published.course.course.repository_id),
        published.course.fallback_administrator.github_user_id,
        "archived"
      ).status
    ).toBe("success");
    const archived = await f.commit("Supported course archive");
    const history = await readMigrationHistorySnapshot(f.root, archived);
    expect(history.revision).toBe(archived);
    expect(history.publication).toBe(f.publication);
    expect(history.metadata.audit).toEqual(published.metadata.audit);
    expect(history.record).toEqual(record);
    expect(history.executionState).toBe("fresh_plan_required");
    await expect(f.read()).rejects.toThrow("fresh_plan_required");
    const fresh = await f.replan();
    expect(fresh.publication).toBe(f.publication);
    expect(fresh.source).toBe(f.source);
    expect(fresh.metadata).toEqual(published.metadata);
    expect(fresh.record?.status).toBe("needs_attention");
    expect(fresh.record?.steps).toEqual([]);
    expect(fresh.record?.history).toEqual([
      ...record.history,
      expect.objectContaining({ step: "fresh_plan", observedRevision: archived })
    ]);
  });
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
    expect((await f.inspect()).executionState).toBe("fresh_plan_required");
    expect((await f.inspect()).metadata.audit).toEqual(
      (await readMigrationHistorySnapshot(f.root, f.publication)).metadata.audit
    );
    const replanned = await f.replan();
    expect(replanned.record?.steps).toEqual([]);
    f.put("course.yml", `${original}\n# another change\n`);
    await f.commit("Invalidate the new plan");
    await expect(f.read()).rejects.toThrow("fresh_plan_required");
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
    await expect(f.inspect()).rejects.toThrow();
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
    await expect(f.inspect()).rejects.toThrow();
    fs.rmSync(path.join(f.root, RECONCILIATION_PATH));
    await f.commit("Remove journal");
    await expect(f.read()).rejects.toThrow();
    await expect(f.inspect()).rejects.toThrow();
  });
  it("does not accept an asserted Ready flag without complete verified operations", async () => {
    const f = await fixture();
    const record = createReconciliationRecord(await f.read());
    record.status = "ready";
    f.put(RECONCILIATION_PATH, JSON.stringify(record));
    await f.commit("Forged readiness");
    await expect(f.read()).rejects.toThrow();
    await expect(f.inspect()).rejects.toThrow();
  });

  it("replans from current roles without reviving the former account or reviewed authority", async () => {
    const f = await fixture();
    const original = await f.read();
    const former = original.course.fallback_administrator.github_user_id;
    const current = reconciliationValue(
      original.course.faculty_directory.find((faculty) => faculty.github_user_id !== former)
    ).github_user_id;
    const course = structuredClone(original.course);
    course.fallback_administrator.github_user_id = current;
    f.put("course.yml", stringify(course));
    const term = rawTermConfigV2Schema.parse(
      parse(fs.readFileSync(path.join(f.root, "terms/27s1/term.yml"), "utf8"))
    );
    term.coordinators.former.push(...term.coordinators.current);
    term.coordinators.current = [{ github_user_id: current }];
    f.put("terms/27s1/term.yml", stringify(term));
    const changed = await f.commit("Current role handoff");
    const history = await f.inspect();
    expect(history.metadata.audit).toEqual(original.metadata.audit);
    expect(history.metadata.source.authenticated_github_user_id).toBe(
      original.metadata.source.authenticated_github_user_id
    );
    expect(() => createFreshReconciliationRecord(history, former)).toThrow(
      "authorization_required"
    );
    const fresh = await f.replan(current);
    expect(fresh.course.fallback_administrator.github_user_id).toBe(current);
    expect(fresh.record?.plan).toEqual({ baseRevision: changed, actor: current });
  });

  it("withholds changed current resource scope while retaining original source evidence and creation guards", async () => {
    const f = await fixture((snapshot) => {
      addManifest(snapshot, (manifest) => {
        manifest.repositories = manifest.repositories.filter((row) => row.section === "001");
      });
    });
    const original = await f.read();
    const guarded = createReconciliationRecord(original);
    guarded.guards = [
      {
        kind: "team",
        key: "ambiguous-create",
        actor: original.course.fallback_administrator.github_user_id
      }
    ];
    f.put(RECONCILIATION_PATH, JSON.stringify(guarded));
    await f.commit("Unresolved creation");
    const roster = "terms/27s1/rosters/001.csv";
    f.put(roster, `${fs.readFileSync(path.join(f.root, roster), "utf8")}\n`);
    await f.commit("Changed resource scope");
    const fresh = await f.replan();
    expect(fresh.targets).toEqual([]);
    expect(fresh.targetAttention).toContain("current_resource_scope_unverified");
    expect(fresh.record?.guards).toEqual(guarded.guards);
    expect(fresh.metadata).toEqual(original.metadata);
  });

  it("rejects a fresh plan that clears guards, carries Ready outcomes, or replaces permanent events", async () => {
    for (const change of ["guards", "steps", "history"] as const) {
      const f = await fixture();
      const original = await f.read();
      const prior = createFreshReconciliationRecord(
        { ...original, executionState: "current_plan" },
        original.course.fallback_administrator.github_user_id
      );
      prior.guards.push({
        kind: "branch",
        key: "unknown",
        actor: original.course.fallback_administrator.github_user_id
      });
      // Initial journal with historical events is valid at its exact observed publication.
      delete prior.plan;
      f.put(RECONCILIATION_PATH, JSON.stringify(prior));
      await f.commit("Prior durable guard");
      const history = await f.inspect();
      const next = createFreshReconciliationRecord(
        history,
        history.course.fallback_administrator.github_user_id
      );
      if (change === "guards") next.guards = [];
      if (change === "history") next.history = [];
      if (change === "steps")
        next.steps = [{ step: "teams", status: "verified", reasons: [], resources: [] }];
      f.put(RECONCILIATION_PATH, JSON.stringify(next));
      await f.commit("Forged plan transition");
      await expect(f.inspect()).rejects.toThrow();
      await expect(f.read()).rejects.toThrow();
    }
  });

  it("rejects tampered permanent publication evidence even when a later descendant restores it", async () => {
    const f = await fixture();
    const file = ".graider/migration.json";
    const original = fs.readFileSync(path.join(f.root, file), "utf8");
    const changed = migrationMetadataSchema.parse(JSON.parse(original));
    changed.deferred_work.push("forged evidence");
    f.put(file, JSON.stringify(changed));
    await f.commit("Tampered permanent audit");
    f.put(file, original);
    await f.commit("Hide tampering");
    await expect(f.inspect()).rejects.toThrow("Permanent migration audit was changed");
  });

  it("independently rejects a publication whose original-byte provenance was forged", async () => {
    const f = await fixture();
    const file = ".graider/migration.json";
    const metadata = migrationMetadataSchema.parse(
      JSON.parse(fs.readFileSync(path.join(f.root, file), "utf8"))
    );
    const original = reconciliationValue(
      metadata.audit.original_files.find((entry) => entry.path === "course.yml")
    );
    original.bytes_base64 = Buffer.from("forged source").toString("base64");
    f.put(file, JSON.stringify(metadata));
    await f.git("add", file);
    await f.git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "--amend",
      "--no-edit"
    );
    await expect(f.inspect()).rejects.toThrow("Source recovery provenance differs");
  });

  it("does not clear an unrecognized reconciliation marker through a fresh plan or later deletion", async () => {
    const f = await fixture();
    f.put(".graider/reconciliation.yml", "unrecognized_guard: true\n");
    await f.commit("Unknown reconciliation evidence");
    expect((await f.replan()).targetAttention).toContain("unrecognized_reconciliation_metadata");
    fs.rmSync(path.join(f.root, ".graider/reconciliation.yml"));
    await f.commit("Remove unrecognized evidence");
    expect((await f.replan()).targetAttention).toContain("unrecognized_reconciliation_metadata");
  });
});
