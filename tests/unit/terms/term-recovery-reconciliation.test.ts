import { describe, expect, it } from "vitest";
import {
  reconcileCourseTermLifecycle,
  reconcileTermActivation
} from "../../../src/terms/activation-reconciliation.js";
import { draft, active, clientFixture } from "./activation-fixtures.js";
import { buildDeletedDraftTeamCleanup } from "../../../src/github/lifecycle-team-membership.js";
import { renderManagedTeamMetadata } from "../../../src/github/managed-team-identity.js";

describe("post-deletion/rollback lifecycle reconciliation", () => {
  it("empties only retired Draft scoped teams with the existing membership engine", async () => {
    const f = clientFixture();
    expect((await reconcileCourseTermLifecycle(f.input)).status).toBe("reconciled");
    const created = f.client.teamsCreated.length;
    const remaining = f.input.terms.filter((term) => term.term.code !== draft.term.code);
    const result = await reconcileCourseTermLifecycle({
      ...f.input,
      terms: remaining,
      retiredDraftTerms: [draft]
    });
    expect(result.status).toBe("reconciled");
    const retired = result.teams.filter(
      (team) => "termCode" in team.identity && team.identity.termCode === draft.term.code
    );
    expect(retired.length).toBeGreaterThan(0);
    for (const team of retired) {
      if (team.teamId === undefined) throw new Error("Expected existing retired team.");
      expect(f.client.members.get(team.teamId)).toEqual([]);
    }
    expect(f.client.teamsCreated).toHaveLength(created);
    expect(f.client.membershipWrites.some((write) => !write.present)).toBe(true);
    const count = f.client.membershipWrites.length;
    await reconcileCourseTermLifecycle({
      ...f.input,
      terms: remaining,
      retiredDraftTerms: [draft]
    });
    expect(f.client.membershipWrites).toHaveLength(count);
  });
  it("does not create missing retired teams and permits zero Active with readiness false", async () => {
    const f = clientFixture();
    const result = await reconcileCourseTermLifecycle({
      ...f.input,
      terms: [],
      activeTermCode: null,
      retiredDraftTerms: [draft]
    });
    expect(result.status).toBe("reconciled");
    expect(result.studentFacingReady).toBe(false);
    expect(f.client.teamsCreated).toHaveLength(3);
    const retired = result.teams.filter((team) => "termCode" in team.identity);
    expect(retired.every((team) => team.teamId === undefined && team.status === "up_to_date")).toBe(
      true
    );
    await expect(reconcileTermActivation({ ...f.input, terms: [] })).rejects.toThrow(
      "authoritative Active"
    );
  });
  it("rejects unproven retired scopes before external writes", async () => {
    const f = clientFixture();
    for (const retired of [
      active,
      { ...draft, term: { ...draft.term, has_ever_been_active: true } }
    ]) {
      await expect(
        reconcileCourseTermLifecycle({ ...f.input, retiredDraftTerms: [retired] })
      ).rejects.toThrow("retired Draft");
    }
    expect(f.client.teamsCreated).toEqual([]);
    expect(f.client.invitationsCreated).toEqual([]);
  });
  it("does not mistake an unresolved retired-team creation for confirmed absence", async () => {
    const f = clientFixture();
    const retired = buildDeletedDraftTeamCleanup(
      f.input.course,
      [],
      [draft],
      f.input.courseRepositoryId
    )[0];
    if (!retired) throw new Error("Missing retired scope.");
    f.input.teamCreationJournal.add(
      `managed-team-create:${String(f.input.organizationId)}:${renderManagedTeamMetadata(retired.identity)}`
    );
    const result = await reconcileCourseTermLifecycle({
      ...f.input,
      terms: [],
      activeTermCode: null,
      retiredDraftTerms: [draft]
    });
    expect(result.status).toBe("needs_reconciliation");
    expect(result.teams.some((team) => team.reason === "team_creation_unverified")).toBe(true);
    expect(f.client.teamsCreated).toHaveLength(3);
  });
});
