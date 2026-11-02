import { describe, expect, it, vi } from "vitest";
import { reconcileTermActivation } from "../../../src/terms/activation-reconciliation.js";
import { planTermActivation } from "../../../src/terms/term-activation.js";
import { rawTermConfigV2Schema } from "../../../src/config/config-schemas.js";
import {
  course,
  terms,
  draft,
  active,
  FALLBACK,
  FACULTY,
  clientFixture,
  existingStudentTarget
} from "./activation-fixtures.js";

const activated = () => {
  const f = clientFixture();
  const plan = planTermActivation(course, terms, draft.term.code, FALLBACK);
  return {
    ...f,
    input: {
      ...f.input,
      activeTermCode: draft.term.code,
      terms: plan.after.map((term) => rawTermConfigV2Schema.parse(term)),
      studentTargets: [existingStudentTarget]
    }
  };
};

describe("activation desired-state reconciliation", () => {
  it("composes the real Phase 7 engines and converges without repeat writes", async () => {
    const f = activated();
    const result = await reconcileTermActivation(f.input);
    expect(result.status).toBe("reconciled");
    expect(result.studentFacingReady).toBe(true);
    expect(result.studentPermissions).toHaveLength(1);
    expect(result.studentPermissions[0]?.status).toBe("reconciled");
    expect(f.client.teamPermissionWrites.some((write) => write.permission === "admin")).toBe(true);
    const writes = {
      teams: f.client.teamsCreated.length,
      members: f.client.membershipWrites.length,
      grants: f.client.teamPermissionWrites.length,
      fallback: f.fallback.fallbackPermissionWrites.length
    };
    const again = await reconcileTermActivation(f.input);
    expect(again.status).toBe("reconciled");
    expect({
      teams: f.client.teamsCreated.length,
      members: f.client.membershipWrites.length,
      grants: f.client.teamPermissionWrites.length,
      fallback: f.fallback.fallbackPermissionWrites.length
    }).toEqual(writes);
    expect(f.client.invitationsCreated).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("keeps Pending faculty incomplete and converges after acceptance without duplicate invitation", async () => {
    const f = activated();
    f.client.organizationMembers.set(
      course.github.organization,
      f.users.filter((user) => user.id !== FACULTY)
    );
    const first = await reconcileTermActivation(f.input);
    expect(first.status).toBe("needs_reconciliation");
    expect(first.studentFacingReady).toBe(false);
    expect(first.organization).toContainEqual(
      expect.objectContaining({ githubUserId: FACULTY, state: "pending_invitation" })
    );
    expect(f.client.invitationsCreated).toHaveLength(1);
    await reconcileTermActivation(f.input);
    expect(f.client.invitationsCreated).toHaveLength(1);
    f.client.organizationMembers.set(course.github.organization, f.users);
    f.client.organizationInvitations.set(course.github.organization, []);
    expect((await reconcileTermActivation(f.input)).status).toBe("reconciled");
  });

  it("reports failed permission verification without changing lifecycle or retrying writes blindly", async () => {
    const f = activated();
    const before = structuredClone(f.input.terms);
    const HTTP_NO_CONTENT = 204;
    const write = vi
      .spyOn(f.client, "setCourseRepositoryTeamPermission")
      .mockResolvedValue({ status: HTTP_NO_CONTENT, headers: {}, data: null });
    const result = await reconcileTermActivation(f.input);
    expect(result.status).toBe("needs_reconciliation");
    expect(result.studentFacingReady).toBe(false);
    expect(result.coursePermissions.some((value) => value.reason === "permission_unverified")).toBe(
      true
    );
    expect(f.input.terms).toEqual(before);
    write.mockRestore();
    expect((await reconcileTermActivation(f.input)).status).toBe("reconciled");
  });

  it("retains ambiguous team creation evidence across explicit reconciliation", async () => {
    const f = activated();
    const HTTP_CREATED = 201;
    const create = vi
      .spyOn(f.client, "createManagedTeam")
      .mockResolvedValue({ status: HTTP_CREATED, headers: {}, data: {} });
    expect((await reconcileTermActivation(f.input)).status).toBe("needs_reconciliation");
    const attempts = create.mock.calls.length;
    await reconcileTermActivation(f.input);
    expect(create).toHaveBeenCalledTimes(attempts);
    expect(f.input.teamCreationJournal.size).toBeGreaterThan(0);
  });

  it("rejects Draft student targets and stale Active identity before external writes", async () => {
    const f = clientFixture();
    await expect(
      reconcileTermActivation({
        ...f.input,
        studentTargets: [{ ...existingStudentTarget, termCode: draft.term.code }]
      })
    ).rejects.toThrow("Draft terms");
    await expect(
      reconcileTermActivation({ ...f.input, activeTermCode: draft.term.code })
    ).rejects.toThrow("authoritative Active");
    expect(f.client.teamsCreated).toEqual([]);
    expect(f.client.invitationsCreated).toEqual([]);
    expect(f.client.teamPermissionWrites).toEqual([]);
    expect(active.term.status).toBe("active");
  });
});
