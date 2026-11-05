// @vitest-environment node
import { GIT_INTEGRATION_TIMEOUT_MS, removeGitFixture } from "./gitIntegrationFixtures";
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changeManagedCourseLifecycle,
  type CourseLifecycleRequest
} from "./courseLifecycleService";
import { recoverManagedTerm, type TermRecoveryRequest } from "./termRecoveryService";
import { termLifecycleFixture } from "./termLifecycleFixtures";
import { fixtureGit as git } from "./managedOperationalFixtures";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const fixture = async (
  options: {
    terms?: "archived" | "empty" | "draft" | "active" | "only-draft";
    lifecycle?: "unarchived" | "archived";
    order?: string[];
    checkpoint?: string;
  } = {}
) => {
  const f = await termLifecycleFixture(true);
  roots.push(f.root);
  const mode = options.terms ?? "archived";
  const coursePath = path.join(f.writer, "course.yml");
  const course = parse(fs.readFileSync(coursePath, "utf8"));
  course.course.lifecycle = options.lifecycle ?? "unarchived";
  if (mode === "empty") {
    fs.rmSync(path.join(f.writer, "terms"), { recursive: true });
    course.course.term_creation_order = [];
  } else {
    if (mode === "only-draft") {
      fs.rmSync(path.join(f.writer, "terms/27s1"), { recursive: true });
      course.course.term_creation_order = ["27s2"];
    }
    const file = path.join(f.writer, "terms/27s2/term.yml");
    const term = parse(fs.readFileSync(file, "utf8"));
    term.term.status =
      mode === "active"
        ? "active"
        : mode === "draft" || mode === "only-draft"
          ? "draft"
          : "archived";
    term.term.has_ever_been_active = term.term.status !== "draft";
    fs.writeFileSync(file, stringify(term));
  }
  if (options.order) course.course.term_creation_order = options.order;
  if (options.checkpoint)
    fs.writeFileSync(path.join(f.writer, "terms/27s2/activation-recovery.yml"), options.checkpoint);
  fs.writeFileSync(coursePath, stringify(course));
  await git(f.writer, ["add", "."]);
  await git(f.writer, ["commit", "--allow-empty", "-m", "Course lifecycle fixture"]);
  await git(f.writer, ["push", "origin", "main"]);
  const fresh = async (actor = 42): Promise<CourseLifecycleRequest> => {
    await f.request.input.resynchronize?.(true);
    const revision = await git(f.remote, ["rev-parse", "main"]);
    return {
      ...f.request,
      input: { ...f.request.input, userId: actor },
      context: {
        ...f.request.context,
        userId: actor,
        authoritativeCommit: revision,
        operationalCommit: revision
      },
      expectedRevision: revision,
      targetStatus: "archived"
    };
  };
  return {
    ...f,
    fresh,
    remoteCourse: async () => parse(await git(f.remote, ["show", "main:course.yml"]))
  };
};

describe("future v2 shared course lifecycle publication", () => {
  it(
    "archives/unarchives in separate single scoped commits without changing terms, histories, checkpoints, or GitHub state",
    async () => {
      const f = await fixture();
      const before = await Promise.all([f.remoteTerm("27s1"), f.remoteTerm("27s2")]);
      const request = await f.fresh(43);
      const source = request.context.authoritativeCommit;
      f.setOnPush(async () => {
        expect((await f.remoteCourse()).course.lifecycle).toBe("unarchived");
        expect(f.reconcile).not.toHaveBeenCalled();
      });
      const archived = await changeManagedCourseLifecycle(request);
      expect(archived).toMatchObject({
        status: "archived",
        beforeStatus: "unarchived",
        afterStatus: "archived",
        authorizationBasis: "most-recent-term-current-coordinator"
      });
      if (archived.status !== "archived") throw new Error("Expected archive.");
      expect(await git(f.remote, ["log", "--format=%H", `${source}..main`])).toBe(
        archived.revision
      );
      expect(
        await git(f.remote, ["diff-tree", "--no-commit-id", "--name-only", "-r", archived.revision])
      ).toBe("course.yml");
      expect(Object.isFrozen(archived)).toBe(true);
      f.setOnPush(async () => {});
      const unarchived = await changeManagedCourseLifecycle({
        ...(await f.fresh(43)),
        targetStatus: "unarchived"
      });
      expect(unarchived.status).toBe("unarchived");
      expect(await Promise.all([f.remoteTerm("27s1"), f.remoteTerm("27s2")])).toEqual(before);
      expect(await git(f.remote, ["ls-tree", "-r", "--name-only", "main"])).not.toContain(
        "activation-recovery.yml"
      );
      expect(f.reconcile).not.toHaveBeenCalled();
      expect(f.push).toHaveBeenCalledTimes(2);
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it.each(["unarchived", "archived"] as const)(
    "same-state %s is authorized and creates no commit",
    async (lifecycle) => {
      const f = await fixture({ lifecycle });
      const request = { ...(await f.fresh()), targetStatus: lifecycle };
      const result = await changeManagedCourseLifecycle(request);
      expect(result).toMatchObject({
        status: "up_to_date",
        revision: request.context.authoritativeCommit
      });
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(request.context.authoritativeCommit);
      expect(f.push).not.toHaveBeenCalled();
      expect(f.reconcile).not.toHaveBeenCalled();
      expect(
        (
          await changeManagedCourseLifecycle({
            ...request,
            input: { ...request.input, userId: 44 },
            context: { ...request.context, userId: 44 }
          })
        ).status
      ).toBe("needs_attention");
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it.each(["draft", "active"] as const)(
    "blocks %s without changing it or reconciling",
    async (terms) => {
      const f = await fixture({ terms });
      const request = await f.fresh();
      expect(await changeManagedCourseLifecycle(request)).toMatchObject({
        status: "needs_attention",
        reason: terms === "draft" ? "draft-term-exists" : "active-term-exists"
      });
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(request.context.authoritativeCommit);
      expect((await f.remoteTerm("27s2")).term.status).toBe(terms);
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it.each(["schema_version: 99\n", "not: [valid\n"])(
    "fails closed on malformed or unsupported checkpoint %s",
    async (checkpoint) => {
      const f = await fixture({ checkpoint });
      expect(await changeManagedCourseLifecycle(await f.fresh())).toMatchObject({
        status: "needs_attention",
        reason: "checkpoint_invalid"
      });
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "takes authority from persisted creation order rather than sorted directory names",
    async () => {
      const f = await fixture({ order: ["27s2", "27s1"] });
      expect(await changeManagedCourseLifecycle(await f.fresh(43))).toMatchObject({
        status: "needs_attention",
        reason: "no-course-lifecycle-authority"
      });
      expect((await changeManagedCourseLifecycle(await f.fresh())).status).toBe("archived");
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "refuses dangling or incomplete references without inferring a replacement",
    async () => {
      const f = await fixture({ order: ["99s1"] });
      expect(await changeManagedCourseLifecycle(await f.fresh())).toMatchObject({
        status: "needs_attention",
        reason: "invalid-course-state"
      });
      expect((await f.remoteCourse()).course.term_creation_order).toEqual(["99s1"]);
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "zero-term archive/unarchive creates no terms and only fallback has authority",
    async () => {
      const f = await fixture({ terms: "empty" });
      expect((await changeManagedCourseLifecycle(await f.fresh(43))).status).toBe(
        "needs_attention"
      );
      expect((await changeManagedCourseLifecycle(await f.fresh())).status).toBe("archived");
      expect(
        (await changeManagedCourseLifecycle({ ...(await f.fresh()), targetStatus: "unarchived" }))
          .status
      ).toBe("unarchived");
      expect(await git(f.remote, ["ls-tree", "-r", "--name-only", "main", "terms"])).toBe("");
      expect((await f.remoteCourse()).course.term_creation_order).toEqual([]);
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "rejects stale source and remote races without retries or publication",
    async () => {
      const f = await fixture();
      const request = await f.fresh();
      await expect(
        changeManagedCourseLifecycle({ ...request, expectedRevision: "stale" })
      ).rejects.toMatchObject({ result: { reason: "remote_version_conflict" } });
      let winner = "";
      await expect(
        changeManagedCourseLifecycle({
          ...request,
          revalidateRepository: async () => {
            winner = await f.advance();
          }
        })
      ).rejects.toMatchObject({ result: { reason: "remote_version_conflict" } });
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(winner);
      expect((await f.remoteCourse()).course.lifecycle).toBe("unarchived");
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "retains a remotely accepted commit when the push response is lost, without another commit",
    async () => {
      const f = await fixture();
      const request = await f.fresh();
      f.setAfterPush(async () => {
        throw new Error("Lost response");
      });
      const result = await changeManagedCourseLifecycle(request);
      expect(result.status).toBe("archived");
      if (result.status !== "archived") throw new Error("Expected authoritative archive.");
      expect(
        await git(f.remote, ["log", "--format=%H", `${request.context.authoritativeCommit}..main`])
      ).toBe(result.revision);
      expect(f.push).toHaveBeenCalledOnce();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "rejected publication preserves authoritative state without GitHub desired-state writes",
    async () => {
      const f = await fixture();
      const request = await f.fresh();
      f.setOnPush(async () => {
        throw new Error("Rejected");
      });
      await expect(changeManagedCourseLifecycle(request)).rejects.toMatchObject({
        result: { reason: "publication_failed" }
      });
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(request.context.authoritativeCommit);
      expect(f.reconcile).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "refuses production v1 and mismatched immutable identity contexts",
    async () => {
      const f = await fixture();
      const request = await f.fresh();
      for (const input of [
        { ...request.input, course: { ...request.input.course, schemaVersion: 1 } },
        { ...request.input, userId: 44 }
      ]) {
        await expect(changeManagedCourseLifecycle({ ...request, input })).rejects.toThrow(
          "trusted v2"
        );
      }
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
});

describe("atomic creation-order maintenance on Draft deletion", () => {
  it.each(["draft", "only-draft"] as const)(
    "deletes newest %s with its reference in one commit",
    async (terms) => {
      const f = await fixture({ terms });
      const source = await f.fresh();
      const inspectActivity: Extract<
        TermRecoveryRequest,
        { operation: "delete-draft" }
      >["inspectActivity"] = vi.fn(async (context) => ({
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
      }));
      const reconcile = vi.fn<NonNullable<TermRecoveryRequest["reconcile"]>>(async () => ({
        status: "reconciled",
        studentFacingReady: false,
        organization: [],
        teams: [],
        coursePermissions: [],
        studentPermissions: []
      }));
      const result = await recoverManagedTerm({
        ...f.request,
        ...source,
        targetTermCode: "27s2",
        operation: "delete-draft",
        inspectActivity,
        reconcile
      });
      expect(result.status).toBe("deleted_reconciled");
      if (!("commit" in result)) throw new Error("Expected committed deletion.");
      expect((await f.remoteCourse()).course.term_creation_order).toEqual(
        terms === "only-draft" ? [] : ["27s1"]
      );
      expect(
        await git(f.remote, ["log", "--format=%H", `${source.context.authoritativeCommit}..main`])
      ).toBe(result.commit);
      expect(
        await git(f.remote, ["diff-tree", "--no-commit-id", "--name-only", "-r", result.commit])
      ).toContain("course.yml");
      expect(reconcile.mock.calls[0]?.[0].course.course.term_creation_order).toEqual(
        terms === "only-draft" ? [] : ["27s1"]
      );
      expect((await changeManagedCourseLifecycle(await f.fresh())).status).toBe("archived");
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
});
