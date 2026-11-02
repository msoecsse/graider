// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activateManagedTerm, type TermActivationRequest } from "./termActivationService";
import type { GitWorkspaceSynchronizer } from "./gitWorkspaceReader";
import {
  managedOperationalFixture,
  fixtureGit as git,
  fixtureCourseYaml
} from "./managedOperationalFixtures";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const fixture = async (initial = false) => {
  const f = await managedOperationalFixture();
  roots.push(f.root);
  const course = {
    ...parse(fixtureCourseYaml),
    schema_version: 2,
    faculty_directory: [42, 43, 44].map((id) => ({
      institutional_username: `faculty-${id}`,
      github_user_id: id,
      github_login: `faculty-${id}`,
      github_login_history: []
    })),
    fallback_administrator: { github_user_id: 42 }
  };
  const term = (code: string, status: string, coordinator: number) => ({
    schema_version: 2,
    term: {
      code,
      academic_year: 2027,
      semester: 1,
      display_name: code,
      status,
      has_ever_been_active: status !== "draft"
    },
    coordinators: { current: [{ github_user_id: coordinator }], former: [] },
    sections: [{ id: "001", faculty: { current: [{ github_user_id: 44 }], former: [] } }]
  });
  fs.writeFileSync(path.join(f.writer, "course.yml"), stringify(course));
  fs.writeFileSync(
    path.join(f.writer, "terms/27s1/term.yml"),
    stringify(term("27s1", initial ? "archived" : "active", 42))
  );
  fs.mkdirSync(path.join(f.writer, "terms/27s2"));
  fs.writeFileSync(
    path.join(f.writer, "terms/27s2/term.yml"),
    stringify(term("27s2", "draft", 43))
  );
  await git(f.writer, ["add", "."]);
  await git(f.writer, ["commit", "-m", "Isolated v2 fixture"]);
  await git(f.writer, ["push", "origin", "main"]);
  const head = await git(f.remote, ["rev-parse", "main"]);
  const synchronize = async () => {
    const workspace = (await f.auth.factory.open(f.cache)) as unknown as GitWorkspaceSynchronizer;
    await workspace.fetchOrigin({ authentication: f.auth.authentication });
    const currentCommit = await git(f.remote, ["rev-parse", "main"]);
    const state = await workspace.inspect();
    if (state.head.kind !== "attached") throw new Error("Detached fixture cache.");
    if (state.head.commit !== currentCommit)
      await workspace.fastForwardToCommit({
        expectedHead: state.head.commit,
        expectedBranch: "main",
        targetCommit: currentCommit
      });
    return { status: "up_to_date" as const, diagnostic: null, retryable: false, currentCommit };
  };
  await synchronize();
  const observed = {
    status: "reconciled" as const,
    studentFacingReady: true,
    organization: [],
    teams: [],
    coursePermissions: [],
    studentPermissions: []
  };
  const reconcile = vi.fn<NonNullable<TermActivationRequest["reconcile"]>>(async () => {
    expect(await git(f.remote, ["rev-parse", "main"])).not.toBe(head);
    return Object.freeze(observed);
  });
  const input: TermActivationRequest["input"] = {
    token: "oauth-fixture-secret",
    userId: 42,
    course: { ...f.course, schemaVersion: 2 },
    signal: new AbortController().signal,
    revalidateSession: async () => true,
    resynchronize: synchronize
  };
  const request: TermActivationRequest = {
    userData: f.root,
    input,
    context: {
      userId: 42,
      repositoryId: 20,
      authoritativeCommit: head,
      operationalCommit: head,
      courseFolderId: "fixture",
      courseFolderPath: f.cache,
      mode: "new_mutation"
    },
    expectedRevision: head,
    author: { name: "Fixture", email: "fixture@example.test" },
    changed: vi.fn(),
    authenticate: f.authenticate,
    revalidateRepository: vi.fn(async () => {}),
    targetTermCode: "27s2",
    reconcile,
    reconciliation: {
      client: {} as never,
      studentTargets: [],
      invitationJournal: new Set(),
      teamCreationJournal: new Set()
    }
  };
  const remoteTerm = async (code: string) =>
    parse(await git(f.remote, ["show", `main:terms/${code}/term.yml`]));
  const advance = async () => {
    const file = path.join(f.writer, "course.yml");
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf8").replace("Original title", "Remote winner")
    );
    await git(f.writer, ["commit", "-am", "Remote winner"]);
    await git(f.writer, ["push", "origin", "main"]);
    return git(f.remote, ["rev-parse", "main"]);
  };
  return { ...f, head, request, reconcile, remoteTerm, advance, observed };
};

describe("future v2 atomic activation publication", () => {
  it("publishes both lifecycle files in one commit, then reconciles", async () => {
    const f = await fixture();
    f.setOnPush(async () => {
      expect(f.reconcile).not.toHaveBeenCalled();
      expect((await f.remoteTerm("27s1")).term.status).toBe("active");
      expect((await f.remoteTerm("27s2")).term.status).toBe("draft");
    });
    const result = await activateManagedTerm(f.request);
    expect(result.status).toBe("activated_reconciled");
    expect(result.studentFacingReady).toBe(true);
    expect(result.plan.previousActiveTermCode).toBe("27s1");
    expect((await f.remoteTerm("27s1")).term).toMatchObject({
      status: "archived",
      has_ever_been_active: true
    });
    expect((await f.remoteTerm("27s2")).term).toMatchObject({
      status: "active",
      has_ever_been_active: true
    });
    expect(await git(f.remote, ["log", "--format=%H", `${f.head}..main`])).toBe(result.commit);
    expect(
      (
        await git(f.remote, ["diff-tree", "--no-commit-id", "--name-only", "-r", result.commit])
      ).split("\n")
    ).toEqual(["terms/27s1/term.yml", "terms/27s2/term.yml"]);
    expect(f.push).toHaveBeenCalledOnce();
    expect(f.reconcile).toHaveBeenCalledOnce();
    await expect(activateManagedTerm(f.request)).rejects.toMatchObject({
      result: { reason: "remote_version_conflict" }
    });
    expect(f.push).toHaveBeenCalledOnce();
  }, 20_000);

  it("initial zero-Active activation changes only the target", async () => {
    const f = await fixture(true);
    const result = await activateManagedTerm(f.request);
    expect(result.plan.previousActiveTermCode).toBeNull();
    expect(result.plan.changedTermCodes).toEqual(["27s2"]);
    expect(
      await git(f.remote, ["diff-tree", "--no-commit-id", "--name-only", "-r", result.commit])
    ).toBe("terms/27s2/term.yml");
  }, 20_000);

  it("blocks stale views before clone and remote races after planning before push", async () => {
    const f = await fixture();
    await expect(
      activateManagedTerm({ ...f.request, expectedRevision: "stale" })
    ).rejects.toMatchObject({ result: { reason: "remote_version_conflict" } });
    expect(f.clone).not.toHaveBeenCalled();
    let winner = "";
    const request = {
      ...f.request,
      revalidateRepository: async () => {
        winner = await f.advance();
      }
    };
    await expect(activateManagedTerm(request)).rejects.toMatchObject({
      result: { reason: "remote_version_conflict" }
    });
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(winner);
    expect((await f.remoteTerm("27s1")).term.status).toBe("active");
    expect((await f.remoteTerm("27s2")).term.status).toBe("draft");
    expect(f.push).not.toHaveBeenCalled();
    expect(f.reconcile).not.toHaveBeenCalled();
  }, 20_000);

  it("rejects a push without external writes and preserves authoritative lifecycle", async () => {
    const f = await fixture();
    f.setOnPush(async () => {
      throw new Error("Rejected transport");
    });
    await expect(activateManagedTerm(f.request)).rejects.toMatchObject({
      result: { reason: "publication_failed" }
    });
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(f.head);
    expect(f.reconcile).not.toHaveBeenCalled();
    expect(f.push).toHaveBeenCalledOnce();
  }, 20_000);

  it("verifies an accepted push with a lost response and never duplicates the activation commit", async () => {
    const f = await fixture();
    f.setAfterPush(async () => {
      throw new Error("Lost response");
    });
    const result = await activateManagedTerm(f.request);
    expect(result.status).toBe("activated_reconciled");
    expect(await git(f.remote, ["log", "--format=%H", `${f.head}..main`])).toBe(result.commit);
    expect(f.push).toHaveBeenCalledOnce();
  }, 20_000);

  it.each(["pending", "failed", "throws"])(
    "retains authoritative activation when reconciliation %s",
    async (mode) => {
      const f = await fixture();
      f.reconcile.mockImplementation(async () => {
        if (mode === "throws") throw new Error("Reconciliation failed");
        return { ...f.observed, status: "needs_reconciliation", studentFacingReady: false };
      });
      const result = await activateManagedTerm(f.request);
      expect(result.status).toBe("activated_needs_reconciliation");
      expect(result.studentFacingReady).toBe(false);
      expect((await f.remoteTerm("27s2")).term.status).toBe("active");
      expect(await git(f.remote, ["log", "--format=%H", `${f.head}..main`])).toBe(result.commit);
      expect(f.reconcile).toHaveBeenCalledOnce();
    },
    20_000
  );

  it("blocks readiness/external writes when the post-publication revision cannot be pinned", async () => {
    const f = await fixture();
    const request = {
      ...f.request,
      input: {
        ...f.request.input,
        resynchronize: async () => ({
          status: "up_to_date" as const,
          diagnostic: null,
          retryable: false,
          currentCommit: "superseded"
        })
      }
    };
    const result = await activateManagedTerm(request);
    expect(result.status).toBe("activated_needs_reconciliation");
    expect(result.reason).toBe("authoritative_revision_changed");
    expect(result.studentFacingReady).toBe(false);
    expect(f.reconcile).not.toHaveBeenCalled();
    expect((await f.remoteTerm("27s2")).term.status).toBe("active");
  }, 20_000);

  it("refuses production v1 before invoking the transaction or reconciliation", async () => {
    const f = await fixture();
    await expect(
      activateManagedTerm({
        ...f.request,
        input: { ...f.request.input, course: { ...f.request.input.course, schemaVersion: 1 } }
      })
    ).rejects.toThrow("trusted v2");
    expect(f.clone).not.toHaveBeenCalled();
    expect(f.reconcile).not.toHaveBeenCalled();
  }, 20_000);

  it("does not report readiness if the source changes during external reconciliation", async () => {
    const f = await fixture();
    let reconciled = false;
    const request = {
      ...f.request,
      reconcile: async (...args: Parameters<NonNullable<TermActivationRequest["reconcile"]>>) => {
        const observed = await f.reconcile(...args);
        reconciled = true;
        return observed;
      },
      input: {
        ...f.request.input,
        resynchronize: async () => ({
          status: "up_to_date" as const,
          diagnostic: null,
          retryable: false,
          currentCommit: reconciled ? "superseded" : await git(f.remote, ["rev-parse", "main"])
        })
      }
    };
    const result = await activateManagedTerm(request);
    expect(result.status).toBe("activated_needs_reconciliation");
    expect(result.studentFacingReady).toBe(false);
    expect(result.reconciliation?.status).toBe("reconciled");
    expect(result.reason).toBe("authoritative_revision_changed");
    expect(f.reconcile).toHaveBeenCalledOnce();
  }, 20_000);
});
