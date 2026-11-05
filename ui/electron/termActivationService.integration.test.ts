// @vitest-environment node
import { GIT_INTEGRATION_TIMEOUT_MS, removeGitFixture } from "./gitIntegrationFixtures";
import fs from "node:fs";
import { parse } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activateManagedTerm, type TermActivationRequest } from "./termActivationService";
import { fixtureGit as git } from "./managedOperationalFixtures";
import { termLifecycleFixture } from "./termLifecycleFixtures";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const fixture = async (initial = false) => {
  const f = await termLifecycleFixture(initial);
  roots.push(f.root);
  return f;
};

describe("future v2 atomic activation publication", () => {
  it(
    "publishes both lifecycle files in one commit, then reconciles",
    async () => {
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
      const checkpoint = parse(
        await git(f.remote, ["show", "main:terms/27s2/activation-recovery.yml"])
      );
      expect(checkpoint).toMatchObject({
        schema_version: 1,
        target_term_code: "27s2",
        previous_active_term_code: "27s1",
        state: "rollback_available",
        activating_github_user_id: 42,
        activated_from_revision: f.head
      });
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
      ).toEqual([
        "terms/27s1/term.yml",
        "terms/27s2/activation-recovery.yml",
        "terms/27s2/term.yml"
      ]);
      expect(f.push).toHaveBeenCalledOnce();
      expect(f.reconcile).toHaveBeenCalledOnce();
      await expect(activateManagedTerm(f.request)).rejects.toMatchObject({
        result: { reason: "remote_version_conflict" }
      });
      expect(f.push).toHaveBeenCalledOnce();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "initial zero-Active activation changes only the target",
    async () => {
      const f = await fixture(true);
      const result = await activateManagedTerm(f.request);
      expect(result.plan.previousActiveTermCode).toBeNull();
      expect(
        parse(await git(f.remote, ["show", "main:terms/27s2/activation-recovery.yml"]))
          .previous_active_term_code
      ).toBeNull();
      expect(result.plan.changedTermCodes).toEqual(["27s2"]);
      expect(
        await git(f.remote, ["diff-tree", "--no-commit-id", "--name-only", "-r", result.commit])
      ).toBe("terms/27s2/activation-recovery.yml\nterms/27s2/term.yml");
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "blocks stale views before clone and remote races after planning before push",
    async () => {
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
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "rejects a push without external writes and preserves authoritative lifecycle",
    async () => {
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
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "verifies an accepted push with a lost response and never duplicates the activation commit",
    async () => {
      const f = await fixture();
      f.setAfterPush(async () => {
        throw new Error("Lost response");
      });
      const result = await activateManagedTerm(f.request);
      expect(result.status).toBe("activated_reconciled");
      expect(await git(f.remote, ["log", "--format=%H", `${f.head}..main`])).toBe(result.commit);
      expect(f.push).toHaveBeenCalledOnce();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

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
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "blocks readiness/external writes when the post-publication revision cannot be pinned",
    async () => {
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
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "refuses production v1 before invoking the transaction or reconciliation",
    async () => {
      const f = await fixture();
      await expect(
        activateManagedTerm({
          ...f.request,
          input: { ...f.request.input, course: { ...f.request.input.course, schemaVersion: 1 } }
        })
      ).rejects.toThrow("trusted v2");
      expect(f.clone).not.toHaveBeenCalled();
      expect(f.reconcile).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );

  it(
    "does not report readiness if the source changes during external reconciliation",
    async () => {
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
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
});
