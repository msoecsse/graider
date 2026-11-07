import { describe, expect, it } from "vitest";
import { loadMigrationReviewBackend } from "./migrationReviewService.js";
import {
  migrationViewFixture,
  reviewedSubmissionFixture,
  REVIEW_USER,
  REVIEW_OTHER_USER
} from "./migrationReviewFixtures.js";
import { graderContextFixture } from "./migrationReviewFixtures.js";

const decisions = [
  { githubUserId: REVIEW_USER, disposition: "existing_sufficient", sections: [] },
  { githubUserId: REVIEW_OTHER_USER, disposition: "no_access", sections: [] }
];
describe("explicit legacy grader review", () => {
  const run = (context = graderContextFixture(), selected: unknown = decisions) =>
    loadMigrationReviewBackend().reviewGraderAccess(context, {
      inventoryId: context.inventoryId,
      decisions: selected
    });
  it("requires every member, infers no access and preserves existing relationships", () => {
    const context = graderContextFixture();
    expect(run(context, []).missingMemberIds).toEqual([REVIEW_USER, REVIEW_OTHER_USER]);
    const result = run(context);
    expect(result.status).toBe("complete");
    expect(result.terms).toEqual(context.review.terms);
    expect(result.publicationReady).toBe(false);
    expect(Object.isFrozen(result.terms)).toBe(true);
  });
  it("supports complete empty membership", () => {
    const context = { ...structuredClone(graderContextFixture()) };
    context.inventory = {
      ...context.inventory,
      candidate: { ...context.inventory.candidate!, members: [] }
    };
    expect(run(context, []).status).toBe("complete");
  });
  it.each(
    [
      [...decisions, decisions[0]],
      [{ ...decisions[0], extra: true }, decisions[1]],
      [{ ...decisions[0], disposition: "no_access" }, decisions[1]],
      [{ ...decisions[0], githubUserId: 999 }, decisions[1]],
      [
        decisions[0],
        {
          ...decisions[1],
          disposition: "assign",
          sections: [{ termCode: "27s1", sectionId: "001" }]
        }
      ]
    ].map((selected) => ({ selected }))
  )(
    "rejects unknown keys, duplicate identities, removal and unverified additions: %j",
    ({ selected }) => {
      expect(run(graderContextFixture(), selected).status).toBe("blocked");
    }
  );
  it.each(["draft", "active", "archived"] as const)(
    "adds verified faculty to exact %s scopes as retained current roles without history",
    (status) => {
      const context = { ...structuredClone(graderContextFixture()) };
      context.review = {
        ...context.review,
        facultyDirectory: [
          ...context.review.facultyDirectory,
          {
            institutional_username: "newprof",
            github_user_id: REVIEW_OTHER_USER,
            github_login: "new-faculty",
            github_login_history: []
          }
        ],
        terms: context.review.terms.map((t) => ({
          ...t,
          status,
          hasEverBeenActive: true
        }))
      };
      const selected = [
        decisions[0],
        {
          ...decisions[1],
          disposition: "assign",
          sections: [{ termCode: "27s1", sectionId: "001" }]
        }
      ];
      const result = run(context, selected);
      expect(result.status).toBe("complete");
      expect(result.terms[0]?.sections[0]).toEqual({
        sectionId: "001",
        currentFacultyGithubUserIds: [REVIEW_USER, REVIEW_OTHER_USER]
      });
      expect(
        run(context, [
          decisions[0],
          { ...selected[1], sections: [{ termCode: "wrong", sectionId: "001" }] }
        ]).status
      ).toBe("blocked");
    }
  );
  it("rejects replaced inventory, extra top-level keys and source mismatches", () => {
    const context = graderContextFixture();
    const backend = loadMigrationReviewBackend();
    expect(backend.reviewGraderAccess(context, { inventoryId: "old", decisions }).status).toBe(
      "blocked"
    );
    expect(
      backend.reviewGraderAccess(context, {
        inventoryId: context.inventoryId,
        decisions,
        authority: true
      }).status
    ).toBe("blocked");
    expect(
      run({
        ...context,
        review: { ...context.review, source: { ...context.review.source, reportId: "old" } }
      }).status
    ).toBe("blocked");
  });
  it("rejects colliding directory identities and incomplete membership", () => {
    const context = graderContextFixture();
    expect(
      run({
        ...context,
        review: {
          ...context.review,
          facultyDirectory: [
            ...context.review.facultyDirectory,
            context.review.facultyDirectory[0]!
          ]
        }
      }).status
    ).toBe("blocked");
    expect(
      run({
        ...context,
        inventory: {
          ...context.inventory,
          candidate: { ...context.inventory.candidate!, membershipComplete: false }
        }
      }).status
    ).toBe("blocked");
  });
});
