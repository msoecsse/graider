import { describe, expect, it } from "vitest";
import {
  validateMigrationReview,
  emptyMigrationReviewSubmission
} from "../../../src/migration/migration-review-validation.js";
import type {
  MigrationReviewContext,
  MigrationReviewSubmission
} from "../../../src/migration/migration-review-models.js";
import {
  fixture,
  term,
  assignment,
  putTerm,
  addManifest,
  manifestPath,
  USER_ID,
  OTHER_USER_ID
} from "./migration-fixtures.js";
import { reviewFixture, completeSubmission } from "./migration-review-fixtures.js";

const check = (context: MigrationReviewContext, patch: Partial<MigrationReviewSubmission> = {}) =>
  validateMigrationReview(context, { ...completeSubmission(context), ...patch });
describe("analysis-bound migration review", () => {
  it("completes typed human decisions while preserving exact source and no publication authority", () => {
    const context = reviewFixture();
    const result = check(context);
    expect(result.status).toBe("complete");
    expect(result.source).toMatchObject({
      repositoryId: context.analysis.source.repositoryId,
      sourceCommitSha: context.analysis.source.sourceCommitSha,
      reportId: context.analysis.reportId,
      authenticatedGithubUserId: context.analysis.source.authenticatedGithubUserId
    });
    expect(result.publicationReady).toBe(false);
    expect(result.courseLifecycle).toBe("unarchived");
  });
  it.each(["repositoryId", "authenticatedGithubUserId", "sourceCommitSha", "reportId"] as const)(
    "rejects wrong %s",
    (key) => {
      const context = reviewFixture();
      const source = {
        ...completeSubmission(context).source,
        [key]: key.endsWith("Id") ? 1 : "wrong"
      };
      expect(check(context, { source }).status).toBe("blocked");
    }
  );
  it("never automatically selects fallback, coordinators, status or unproven history", () => {
    const context = reviewFixture();
    const empty = emptyMigrationReviewSubmission(context);
    expect(empty.fallbackAdministratorUsername).toBeNull();
    expect(empty.creationOrder.confirmed).toBe(false);
    expect(empty.terms[0]).toMatchObject({
      currentCoordinatorUsernames: [],
      status: null,
      hasEverBeenActive: null
    });
    expect(validateMigrationReview(context, empty).status).toBe("incomplete");
  });
  it("complete results are recursively immutable and do not freeze or mutate submissions", () => {
    const context = reviewFixture();
    const submission = completeSubmission(context);
    const before = structuredClone(submission);
    const result = validateMigrationReview(context, submission);
    const frozen = (value: unknown) => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(frozen);
      }
    };
    frozen(result);
    expect(submission).toEqual(before);
    expect(Object.isFrozen(submission)).toBe(false);
  });
  it("malformed foundational analysis cannot complete", () => {
    const input = fixture();
    input.sourceFiles = { "course.yml": "[" };
    expect(check(reviewFixture(input)).status).toBe("blocked");
  });
  it("not applicable v2 and unsupported schemas remain distinct", () => {
    const context = reviewFixture();
    expect(
      check({ ...context, analysis: { ...context.analysis, status: "not_applicable" } }).status
    ).toBe("not_applicable");
    expect(
      check({
        ...context,
        analysis: { ...context.analysis, validatedMigrationFacts: false, status: "blocked" }
      }).status
    ).toBe("blocked");
  });
  it.each([
    { confirmed: true },
    { fallbackAdministratorGithubUserId: USER_ID },
    { facultyDirectory: [] },
    { acknowledgements: [{ kind: "anything", termCode: "27s1", assignmentSlug: "lab04" }] }
  ])("rejects generic or renderer-invented fields %j", (patch) => {
    const context = reviewFixture();
    expect(
      validateMigrationReview(context, { ...completeSubmission(context), ...patch }).status
    ).toBe("blocked");
  });
});

describe("verified faculty and fallback review", () => {
  it("unresolved identities and suggestions cannot become directory authority", () => {
    const input = fixture();
    input.trustedIdentities = [];
    input.suggestions = [
      { institutionalUsername: "jones", githubLogin: "jones", reason: "similar" }
    ];
    const context = reviewFixture(input);
    const result = validateMigrationReview(context, emptyMigrationReviewSubmission(context));
    expect(result.status).toBe("incomplete");
    expect(result.facultyDirectory).toEqual([]);
    expect(result.missingDecisions.some((item) => item.key === "faculty/jones")).toBe(true);
  });
  it("requires valid service-issued identity receipts", () => {
    const context = reviewFixture();
    expect(
      check(context, {
        facultyMappings: [{ institutionalUsername: "jones", verificationId: "guessed" }]
      }).status
    ).toBe("blocked");
  });
  it("rejects direct numeric identity assertions", () => {
    const context = reviewFixture();
    expect(
      validateMigrationReview(context, {
        ...completeSubmission(context),
        facultyMappings: [{ institutionalUsername: "jones", githubUserId: USER_ID }]
      }).status
    ).toBe("blocked");
  });
  it.each(["institutional_username", "github_user_id", "github_login"] as const)(
    "rejects directory collisions on %s",
    (field) => {
      const context = reviewFixture();
      const first = context.verifiedFaculty[0];
      const second = context.verifiedFaculty[1];
      if (!first || !second) throw new Error("Missing verified fixture.");
      const collision = {
        ...second,
        identity: { ...second.identity, [field]: first.identity[field] }
      };
      expect(check({ ...context, verifiedFaculty: [first, collision] }).status).toBe("blocked");
    }
  );
  it("case-insensitive institutional collisions are blocked", () => {
    const context = reviewFixture();
    const first = context.verifiedFaculty[0];
    if (!first) throw new Error("Missing fixture.");
    expect(
      check({
        ...context,
        verifiedFaculty: [
          ...context.verifiedFaculty,
          {
            ...first,
            verificationId: "added",
            identity: {
              ...first.identity,
              institutional_username: first.identity.institutional_username.toUpperCase(),
              github_user_id: OTHER_USER_ID + 2,
              github_login: "added-person"
            },
            origin: "explicit_addition"
          }
        ]
      }).status
    ).toBe("blocked");
  });
  it("supports explicitly verified added faculty as fallback and coordinator", () => {
    const context = reviewFixture();
    const added = {
      identity: {
        institutional_username: "recovery",
        github_user_id: OTHER_USER_ID + 3,
        github_login: "recovery-person",
        github_login_history: []
      },
      verificationId: "verified-added",
      origin: "explicit_addition" as const
    };
    const expanded = { ...context, verifiedFaculty: [...context.verifiedFaculty, added] };
    const result = check(expanded, {
      fallbackAdministratorUsername: "recovery",
      terms: [
        {
          termCode: "27s1",
          currentCoordinatorUsernames: ["recovery"],
          status: "draft",
          hasEverBeenActive: false
        }
      ]
    });
    expect(result.status).toBe("complete");
    expect(result.fallbackAdministratorGithubUserId).toBe(added.identity.github_user_id);
    expect(JSON.stringify(result)).not.toContain('"former"');
  });
  it.each([null, "unresolved"])("requires exactly one verified fallback: %s", (selection) => {
    expect(check(reviewFixture(), { fallbackAdministratorUsername: selection }).status).toBe(
      selection === null ? "incomplete" : "blocked"
    );
  });
});

describe("creation order, coordinators and lifecycle", () => {
  it("proven candidate still requires explicit order confirmation", () => {
    const context = reviewFixture();
    expect(context.analysis.termCreationOrder.value).toEqual(["27s1"]);
    expect(
      check(context, { creationOrder: { termCodes: ["27s1"], confirmed: false } }).status
    ).toBe("incomplete");
  });
  it("accepts explicit manual order when history cannot prove it, without academic sorting", () => {
    const input = fixture();
    delete input.history;
    putTerm(input, { ...term, term: { ...term.term, code: "26s3" } });
    const context = reviewFixture(input);
    const result = check(context, {
      creationOrder: { termCodes: ["27s1", "26s3"], confirmed: true }
    });
    expect(result.status).toBe("complete");
    expect(result.termCreationOrder).toEqual(["27s1", "26s3"]);
  });
  it.each([{ termCodes: [] }, { termCodes: ["27s1", "27s1"] }, { termCodes: ["unknown"] }])(
    "rejects missing/duplicate/unknown order %j",
    ({ termCodes }) => {
      expect(check(reviewFixture(), { creationOrder: { termCodes, confirmed: true } }).status).toBe(
        "blocked"
      );
    }
  );
  it("zero terms permits an explicitly confirmed empty order, with fallback still required", () => {
    const input = fixture();
    input.sourceFiles = { "course.yml": input.sourceFiles["course.yml"] ?? "" };
    const base = reviewFixture();
    const context = { ...reviewFixture(input), verifiedFaculty: base.verifiedFaculty };
    expect(check(context).status).toBe("complete");
    expect(check(context).termCreationOrder).toEqual([]);
  });
  it("every term requires a current coordinator and permits multiple or non-section identities", () => {
    const context = reviewFixture();
    expect(
      check(context, {
        terms: [
          {
            termCode: "27s1",
            currentCoordinatorUsernames: [],
            status: "draft",
            hasEverBeenActive: false
          }
        ]
      }).status
    ).toBe("incomplete");
    const result = check(context, {
      terms: [
        {
          termCode: "27s1",
          currentCoordinatorUsernames: ["jones", "owner"],
          status: "draft",
          hasEverBeenActive: false
        }
      ]
    });
    expect(result.status).toBe("complete");
    expect(result.terms[0]?.currentCoordinatorGithubUserIds).toHaveLength(2);
    expect(
      check(context, {
        terms: [
          {
            termCode: "27s1",
            currentCoordinatorUsernames: ["unverified"],
            status: "draft",
            hasEverBeenActive: false
          }
        ]
      }).status
    ).toBe("blocked");
  });
  it.each([true, false])("Draft permits activation history %s", (hasEverBeenActive) => {
    expect(
      check(reviewFixture(), {
        terms: [
          {
            termCode: "27s1",
            currentCoordinatorUsernames: ["jones"],
            status: "draft",
            hasEverBeenActive
          }
        ]
      }).status
    ).toBe("complete");
  });
  it("unproven history requires yes/no and each term needs explicit status", () => {
    expect(
      check(reviewFixture(), {
        terms: [
          {
            termCode: "27s1",
            currentCoordinatorUsernames: ["jones"],
            status: null,
            hasEverBeenActive: null
          }
        ]
      }).status
    ).toBe("incomplete");
  });
  it.each(["active", "archived"] as const)("%s requires true history", (status) => {
    const context = reviewFixture();
    expect(
      check(context, {
        terms: [
          {
            termCode: "27s1",
            currentCoordinatorUsernames: ["jones"],
            status,
            hasEverBeenActive: false
          }
        ]
      }).status
    ).toBe("blocked");
    expect(
      check(context, {
        terms: [
          {
            termCode: "27s1",
            currentCoordinatorUsernames: ["jones"],
            status,
            hasEverBeenActive: true
          }
        ]
      }).status
    ).toBe("complete");
  });
  it("locks source-proven prior activity true", () => {
    const input = fixture();
    addManifest(input);
    const context = reviewFixture(input);
    expect(check(context).terms[0]?.hasEverBeenActive).toBe(true);
    expect(
      check(context, {
        terms: [
          {
            termCode: "27s1",
            currentCoordinatorUsernames: ["jones"],
            status: "draft",
            hasEverBeenActive: false
          }
        ]
      }).status
    ).toBe("blocked");
  });
  it("permits zero Active but independently rejects two Active", () => {
    const input = fixture();
    putTerm(input, { ...term, term: { ...term.term, code: "26s3" } });
    const context = reviewFixture(input);
    expect(check(context).status).toBe("complete");
    expect(
      check(context, {
        terms: completeSubmission(context).terms.map((entry) => ({
          ...entry,
          status: "active",
          hasEverBeenActive: true
        }))
      }).status
    ).toBe("blocked");
  });
});

describe("deferred decisions and technical blockers", () => {
  it("ownerless, closed and group findings require only exact known acknowledgements", () => {
    const input = fixture();
    putTerm(input, term, [
      {
        ...assignment,
        metadata: {},
        assignment: { ...assignment.assignment, status: "closed" },
        repository_mode: "group"
      }
    ]);
    const context = reviewFixture(input);
    const complete = check(context);
    expect(complete.status).toBe("complete");
    expect(complete.acknowledgements).toHaveLength(3);
    expect(complete.assignmentReviewSummary[0]).toMatchObject({
      legacyStatus: "closed",
      proposedOwnerGithubUserIds: [],
      ownerlessRepairRequired: true
    });
    expect(check(context, { acknowledgements: [] }).status).toBe("incomplete");
    expect(
      check(context, {
        acknowledgements: [
          { kind: "ownerless_assignment", termCode: "27s1", assignmentSlug: "unknown" }
        ]
      }).status
    ).toBe("blocked");
  });
  it("unknown analyzer decision keys fail closed", () => {
    const context = reviewFixture();
    expect(
      check({
        ...context,
        analysis: {
          ...context.analysis,
          reviewDecisions: [
            ...context.analysis.reviewDecisions,
            {
              key: "unknown-security-role",
              classification: "requires_confirmation",
              reason: "unknown",
              candidates: []
            }
          ]
        }
      }).status
    ).toBe("blocked");
  });
  it("manifest conflicts cannot be acknowledged into complete evidence", () => {
    const input = fixture();
    addManifest(input);
    input.runtime = { coverage: "machine_local", files: { [manifestPath]: "[" } };
    const result = check(reviewFixture(input));
    expect(result.status).toBe("complete");
    expect(result.assignmentReviewSummary[0]?.applyState).toBe("ambiguous");
    expect(result.conversionNeedsAttention.length).toBeGreaterThan(0);
  });
  it.each(["unknown", "transfer"])(
    "preserves organization %s blocker and grader debt in a complete human review",
    (condition) => {
      const input = fixture();
      if (condition === "unknown") delete input.binding.historicalOrganizationId;
      else input.binding.historicalOrganizationId = OTHER_USER_ID;
      const result = check(reviewFixture(input));
      expect(result.status).toBe("complete");
      expect(result.publicationReady).toBe(false);
      expect(result.publicationBlockers).toContain(
        condition === "unknown" ? "organization_binding_unknown" : "organization_migration_required"
      );
      expect(result.graderDebtPresent).toBe(true);
    }
  );
});
