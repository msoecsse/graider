// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activateManagedTerm } from "./termActivationService";
import {
  recoverManagedTerm,
  markManagedStudentActivity,
  runAfterManagedActivityMarker,
  type TermRecoveryRequest,
  type StudentActivityMarkerRequest
} from "./termRecoveryService";
import { termLifecycleFixture } from "./termLifecycleFixtures";
import { fixtureGit as git } from "./managedOperationalFixtures";
import { serializeManagedOperation } from "./managedCourses";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const checkpointFile = "terms/27s2/activation-recovery.yml";
const fixture = async (initial = false) => {
  const f = await termLifecycleFixture(initial);
  roots.push(f.root);
  const checkpoint = async () => parse(await git(f.remote, ["show", `main:${checkpointFile}`]));
  const inspectActivity = vi.fn(
    async (
      context: Parameters<
        Extract<TermRecoveryRequest, { operation: "delete-draft" }>["inspectActivity"]
      >[0]
    ) => ({
      schema_version: 1,
      source: "trusted-remote",
      course_repository_id: context.courseRepositoryId,
      revision: context.revision,
      term_code: context.termCode,
      authenticated_github_user_id: context.authenticatedGithubUserId,
      categories: {
        apply: "absent",
        "grading-dispatch": "absent",
        grading: "absent",
        "report-publication": "absent",
        "student-repository-mutation": "absent"
      }
    })
  );
  const reconcile = vi.fn<NonNullable<TermRecoveryRequest["reconcile"]>>(async (input) => ({
    status: "reconciled",
    studentFacingReady: input.activeTermCode !== null,
    organization: [],
    teams: [],
    coursePermissions: [],
    studentPermissions: []
  }));
  const fresh = async (actor = 42) => {
    await f.request.input.resynchronize?.(true);
    const revision = await git(f.remote, ["rev-parse", "main"]);
    return {
      ...f.request,
      reconcile,
      inspectActivity,
      expectedRevision: revision,
      context: {
        ...f.request.context,
        userId: actor,
        authoritativeCommit: revision,
        operationalCommit: revision
      },
      input: { ...f.request.input, userId: actor }
    };
  };
  const activated = async () => {
    const result = await activateManagedTerm(f.request);
    const record = await checkpoint();
    return { result, record };
  };
  const marker = async (activationId: string): Promise<StudentActivityMarkerRequest> => ({
    ...(await fresh(43)),
    activationId,
    category: "grading"
  });
  const commitFixtureFiles = async (files: Record<string, string>) => {
    const revision = await git(f.remote, ["rev-parse", "main"]);
    await git(f.writer, ["fetch", "origin"]);
    await git(f.writer, ["checkout", "-B", "main", revision]);
    for (const [relative, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(f.writer, relative)), { recursive: true });
      fs.writeFileSync(path.join(f.writer, relative), content);
    }
    await git(f.writer, ["add", "."]);
    await git(f.writer, ["commit", "-m", "Trusted fixture evidence"]);
    await git(f.writer, ["push", "origin", "main"]);
  };
  return {
    ...f,
    checkpoint,
    inspectActivity,
    reconcile,
    fresh,
    activated,
    marker,
    commitFixtureFiles
  };
};

describe("authoritative Draft deletion", () => {
  it("publishes the complete preparatory directory deletion once and reconciles remaining terms afterward", async () => {
    const f = await fixture();
    await f.commitFixtureFiles({
      "terms/27s2/assignments/lab01/assignment.yml": "preparatory definition\n",
      "terms/27s2/rosters/section-001.csv": "student_id,github_username\n"
    });
    const before = await git(f.remote, ["rev-parse", "main"]);
    const original = await f.remoteTerm("27s1");
    f.setOnPush(async () => {
      expect(f.reconcile).not.toHaveBeenCalled();
      expect((await f.remoteTerm("27s2")).term.status).toBe("draft");
    });
    const result = await recoverManagedTerm({ ...(await f.fresh()), operation: "delete-draft" });
    expect(result.status).toBe("deleted_reconciled");
    if (!("commit" in result)) throw new Error("Expected committed deletion.");
    expect(await git(f.remote, ["log", "--format=%H", `${before}..main`])).toBe(result.commit);
    expect(await git(f.remote, ["ls-tree", "-r", "--name-only", "main", "terms/27s2"])).toBe("");
    expect(await f.remoteTerm("27s1")).toEqual(original);
    expect(f.reconcile).toHaveBeenCalledOnce();
    expect(f.reconcile.mock.calls[0]?.[0].retiredDraftTerms?.[0]?.term.code).toBe("27s2");
    expect(f.reconcile.mock.calls[0]?.[0].terms.some((term) => term.term.code === "27s2")).toBe(
      false
    );
  }, 20_000);

  it("keeps a successful deletion authoritative when external reconciliation fails", async () => {
    const f = await fixture();
    f.reconcile.mockRejectedValue(new Error("Missing GitHub scope"));
    const result = await recoverManagedTerm({ ...(await f.fresh()), operation: "delete-draft" });
    expect(result.status).toBe("deleted_needs_reconciliation");
    expect(await git(f.remote, ["ls-tree", "-r", "--name-only", "main", "terms/27s2"])).toBe("");
  }, 20_000);

  it.each(["unknown", "present", "runtime", "checkpoint", "repository"])(
    "refuses deletion with %s evidence",
    async (kind) => {
      const f = await fixture();
      if (kind === "runtime")
        await f.commitFixtureFiles({ "terms/27s2/runtime/preserve.json": "evidence" });
      if (kind === "checkpoint")
        await f.commitFixtureFiles({ [checkpointFile]: "schema_version: 99\n" });
      let request = { ...(await f.fresh()), operation: "delete-draft" as const };
      if (kind === "unknown") f.inspectActivity.mockResolvedValue({} as never);
      if (kind === "present")
        f.inspectActivity.mockImplementation(async (context) => ({
          ...(await Promise.resolve({
            schema_version: 1,
            source: "trusted-remote",
            course_repository_id: context.courseRepositoryId,
            revision: context.revision,
            term_code: context.termCode,
            authenticated_github_user_id: context.authenticatedGithubUserId,
            categories: {
              apply: "present",
              "grading-dispatch": "absent",
              grading: "absent",
              "report-publication": "absent",
              "student-repository-mutation": "absent"
            }
          }))
        }));
      if (kind === "repository")
        request = {
          ...request,
          reconciliation: {
            ...request.reconciliation,
            studentTargets: [{ invalid: "incomplete trusted inventory" }]
          }
        };
      const before = await git(f.remote, ["rev-parse", "main"]);
      expect((await recoverManagedTerm(request)).status).toBe("needs_attention");
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(before);
      expect(f.reconcile).not.toHaveBeenCalled();
      expect((await f.remoteTerm("27s2")).term.has_ever_been_active).toBe(false);
    },
    20_000
  );
});

describe("write-ahead marker and atomic recovery", () => {
  it("marks before operation execution and repeated markers preserve the first intent without another commit", async () => {
    const f = await fixture();
    const { record } = await f.activated();
    const execute = vi.fn(async () => {
      expect((await f.checkpoint()).state).toBe("recovery_required");
      return "student operation began";
    });
    const first = await runAfterManagedActivityMarker(
      await f.marker(record.activation_id),
      execute
    );
    expect(first.status).toBe("activity_executed");
    const before = await git(f.remote, ["rev-parse", "main"]);
    const original = await f.checkpoint();
    const again = await markManagedStudentActivity({
      ...(await f.marker(record.activation_id)),
      category: "apply"
    });
    expect(again.status).toBe("activity_marked");
    if (again.status !== "activity_marked") throw new Error("Expected confirmed marker.");
    expect(again.alreadyMarked).toBe(true);
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(before);
    expect(await f.checkpoint()).toEqual(original);
    expect(
      (
        await recoverManagedTerm({
          ...(await f.fresh()),
          operation: "safe-rollback",
          activationId: record.activation_id
        })
      ).status
    ).toBe("recovery_required");
    expect(execute).toHaveBeenCalledOnce();
  }, 20_000);

  it.each([false, true])(
    "safe rollback initial=%s resolves checkpoint atomically and preserves role/history",
    async (initial) => {
      const f = await fixture(initial);
      const { result: activation, record } = await f.activated();
      const before = await f.remoteTerm("27s2");
      const result = await recoverManagedTerm({
        ...(await f.fresh()),
        operation: "safe-rollback",
        activationId: record.activation_id
      });
      expect(result.status).toBe("recovered_reconciled");
      if (!("commit" in result)) throw new Error("Expected recovery commit.");
      expect(result.studentFacingReady).toBe(!initial);
      const after = await f.remoteTerm("27s2");
      expect(after.term).toMatchObject({ status: "draft", has_ever_been_active: true });
      expect(after.coordinators).toEqual(before.coordinators);
      expect(after.sections).toEqual(before.sections);
      expect((await f.remoteTerm("27s1")).term.status).toBe(initial ? "archived" : "active");
      expect(await git(f.remote, ["ls-tree", "--name-only", "main", checkpointFile])).toBe("");
      expect(await git(f.remote, ["log", "--format=%H", `${activation.commit}..main`])).toBe(
        result.commit
      );
      await expect(
        recoverManagedTerm({ ...(await f.fresh()), operation: "delete-draft" })
      ).rejects.toMatchObject({ result: { reason: "publication_failed" } });
    },
    20_000
  );

  it.each(["accept-current", "restore-predecessor"] as const)(
    "%s preserves student activity and resolves checkpoint",
    async (operation) => {
      const f = await fixture();
      const { record } = await f.activated();
      await markManagedStudentActivity(await f.marker(record.activation_id));
      const studentFile = "terms/27s2/grading/lab01/sections/001/student.json";
      const manifestFile = "terms/27s2/assignments/lab01/apply/001/manifest.json";
      await f.commitFixtureFiles({
        [studentFile]: '{"grading":"keep forever"}\n',
        [manifestFile]: '{"repository_id":1234}\n'
      });
      const before = await f.remoteTerm("27s2");
      const result = await recoverManagedTerm({
        ...(await f.fresh()),
        operation,
        activationId: record.activation_id
      });
      expect(result.status).toBe("recovered_reconciled");
      expect((await f.remoteTerm("27s2")).term.status).toBe(
        operation === "accept-current" ? "active" : "archived"
      );
      expect((await f.remoteTerm("27s1")).term.status).toBe(
        operation === "accept-current" ? "archived" : "active"
      );
      expect((await f.remoteTerm("27s2")).coordinators).toEqual(before.coordinators);
      expect(await git(f.remote, ["show", `main:${studentFile}`])).toBe(
        '{"grading":"keep forever"}'
      );
      expect(await git(f.remote, ["show", `main:${manifestFile}`])).toBe('{"repository_id":1234}');
      expect(await git(f.remote, ["ls-tree", "--name-only", "main", checkpointFile])).toBe("");
    },
    20_000
  );

  it("does not run student operations after rejected/stale markers or missing checkpoints", async () => {
    const f = await fixture();
    const { record } = await f.activated();
    const execute = vi.fn(async () => "must not run");
    f.setOnPush(async () => {
      throw new Error("Rejected marker push");
    });
    await expect(
      runAfterManagedActivityMarker(await f.marker(record.activation_id), execute)
    ).rejects.toMatchObject({ result: { reason: "publication_failed" } });
    expect(execute).not.toHaveBeenCalled();
    expect((await f.checkpoint()).state).toBe("rollback_available");
    const missing = await fixture();
    expect(
      (await runAfterManagedActivityMarker(await missing.marker(record.activation_id), execute))
        .status
    ).toBe("activity_blocked");
    expect(execute).not.toHaveBeenCalled();
  }, 20_000);

  it("verifies a remotely accepted marker with a lost response without duplicate operation/commits", async () => {
    const f = await fixture();
    const { result: activation, record } = await f.activated();
    f.setAfterPush(async () => {
      throw new Error("Lost marker response");
    });
    const execute = vi.fn(async () => "authorized work");
    const result = await runAfterManagedActivityMarker(
      await f.marker(record.activation_id),
      execute
    );
    expect(result.status).toBe("activity_executed");
    expect(execute).toHaveBeenCalledOnce();
    expect(
      (await git(f.remote, ["log", "--format=%H", `${activation.commit}..main`])).split("\n")
    ).toHaveLength(1);
  }, 20_000);

  it.each(["activity", "rollback"] as const)(
    "same-base %s wins the existing serialized race",
    async (winner) => {
      const f = await fixture();
      const { result: activation, record } = await f.activated();
      const base = await f.fresh(43);
      const marker: StudentActivityMarkerRequest = {
        ...base,
        activationId: record.activation_id,
        category: "apply"
      };
      const rollback: TermRecoveryRequest = {
        ...base,
        activationId: record.activation_id,
        operation: "safe-rollback"
      };
      const execute = vi.fn(async () => "authorized operation");
      const activity = () => runAfterManagedActivityMarker(marker, execute);
      const recovery = () => recoverManagedTerm(rollback);
      const tasks = winner === "activity" ? [activity, recovery] : [recovery, activity];
      const results = await Promise.allSettled(
        tasks.map((task) => serializeManagedOperation(base.input, task as () => Promise<unknown>))
      );
      expect(results[0]?.status).toBe("fulfilled");
      expect(results[1]?.status).toBe("rejected");
      expect(
        (await git(f.remote, ["log", "--format=%H", `${activation.commit}..main`])).split("\n")
      ).toHaveLength(1);
      if (winner === "activity") {
        expect(
          (
            await recoverManagedTerm({
              ...(await f.fresh()),
              operation: "safe-rollback",
              activationId: record.activation_id
            })
          ).status
        ).toBe("recovery_required");
        expect(execute).toHaveBeenCalledOnce();
      } else {
        expect((await f.remoteTerm("27s2")).term.status).toBe("draft");
        expect(execute).not.toHaveBeenCalled();
      }
    },
    20_000
  );

  it("preserves committed recovery after failed reconciliation", async () => {
    const f = await fixture();
    const { record } = await f.activated();
    f.reconcile.mockRejectedValue(new Error("GitHub unavailable"));
    const result = await recoverManagedTerm({
      ...(await f.fresh()),
      operation: "safe-rollback",
      activationId: record.activation_id
    });
    expect(result.status).toBe("recovered_needs_reconciliation");
    expect((await f.remoteTerm("27s1")).term.status).toBe("active");
    expect((await f.remoteTerm("27s2")).term).toMatchObject({
      status: "draft",
      has_ever_been_active: true
    });
  }, 20_000);

  it("does not recreate an intentionally removed predecessor", async () => {
    const f = await fixture();
    const { record } = await f.activated();
    const revision = await git(f.remote, ["rev-parse", "main"]);
    await git(f.writer, ["fetch", "origin"]);
    await git(f.writer, ["checkout", "-B", "main", revision]);
    fs.rmSync(path.join(f.writer, "terms/27s1"), { recursive: true });
    await git(f.writer, ["commit", "-am", "Intentional remote predecessor deletion"]);
    await git(f.writer, ["push", "origin", "main"]);
    const result = await recoverManagedTerm({
      ...(await f.fresh()),
      operation: "safe-rollback",
      activationId: record.activation_id
    });
    expect(result).toEqual({ status: "needs_attention", reason: "predecessor_missing" });
    expect(await git(f.remote, ["ls-tree", "--name-only", "main", "terms/27s1"])).toBe("");
    expect((await f.remoteTerm("27s2")).term.status).toBe("active");
    expect(f.reconcile).not.toHaveBeenCalled();
  }, 20_000);

  it("initial activation cannot restore a predecessor but can explicitly accept after activity", async () => {
    const f = await fixture(true);
    const { record } = await f.activated();
    await markManagedStudentActivity(await f.marker(record.activation_id));
    await expect(
      recoverManagedTerm({
        ...(await f.fresh()),
        operation: "restore-predecessor",
        activationId: record.activation_id
      })
    ).rejects.toMatchObject({ result: { reason: "publication_failed" } });
    expect((await f.checkpoint()).previous_active_term_code).toBeNull();
    const result = await recoverManagedTerm({
      ...(await f.fresh()),
      operation: "accept-current",
      activationId: record.activation_id
    });
    expect(result.status).toBe("recovered_reconciled");
    expect((await f.remoteTerm("27s2")).term.status).toBe("active");
    expect(await git(f.remote, ["ls-tree", "--name-only", "main", checkpointFile])).toBe("");
  }, 20_000);

  it("retains the marker even when the authorized student operation itself fails", async () => {
    const f = await fixture();
    const { record } = await f.activated();
    await expect(
      runAfterManagedActivityMarker(await f.marker(record.activation_id), async () => {
        throw new Error("Workflow failed after starting");
      })
    ).rejects.toThrow("Workflow failed");
    expect((await f.checkpoint()).state).toBe("recovery_required");
    expect(
      (
        await recoverManagedTerm({
          ...(await f.fresh()),
          operation: "safe-rollback",
          activationId: record.activation_id
        })
      ).status
    ).toBe("recovery_required");
  }, 20_000);
});
