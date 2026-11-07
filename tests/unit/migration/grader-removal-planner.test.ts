import fs from "node:fs";
import ts from "typescript";
import { parse, stringify } from "yaml";
import { fixture, addManifest, OTHER_USER_ID } from "./migration-fixtures.js";
import { describe, expect, it } from "vitest";
import { planGraderRemoval } from "../../../src/migration/grader-removal-planner.js";
import { planAssignmentMigration } from "../../../src/migration/assignment-migration-planner.js";
import { reviewGraderAccess } from "../../../src/migration/grader-access-review.js";
import { validateMigrationReview } from "../../../src/migration/migration-review-validation.js";
import type { LegacyGraderInventoryData } from "../../../src/migration/legacy-grader-models.js";
import { completeSubmission, reviewFixture } from "./migration-review-fixtures.js";

import type { RawCourseConfigV1 } from "../../../src/config/config-models.js";
const required = <T>(value: T | null | undefined): T => {
  if (value === undefined || value === null) throw new Error("Missing fixture value");
  return value;
};
const TEAM_ID = 900;
const OTHER_TEAM_ID = 901;
const setup = (context = reviewFixture()) => {
  const analysis = context.analysis;
  const review = validateMigrationReview(context, completeSubmission(context));
  const assignmentPlan = planAssignmentMigration(analysis, review);
  const inventory: LegacyGraderInventoryData = {
    kind: "schema-v1-legacy-grader-inventory",
    status: "not_applicable",
    publicationReady: false,
    source: { ...analysis.source, reportId: analysis.reportId },
    runtimeCoverage: analysis.runtimeCoverage,
    evidence: structuredClone(analysis.grader.evidence) as LegacyGraderInventoryData["evidence"],
    repositoryEvidence: [],
    candidate: null,
    repositories: [],
    findings: []
  };
  const access = () =>
    reviewGraderAccess(
      {
        inventoryId: "receipt",
        inventory: structuredClone(inventory),
        review: structuredClone(review)
      },
      { inventoryId: "receipt", decisions: [] }
    );
  const plan = () => planGraderRemoval(analysis, review, assignmentPlan, inventory, access());
  return { analysis, review, assignmentPlan, inventory, access, plan };
};
const frozen = (value: unknown): void => {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
};
describe("pure grader removal planner", () => {
  it("separates desired cleanup, audit evidence and conditional reconciliation", () => {
    const f = setup();
    const before = JSON.stringify(f.inventory);
    const plan = f.plan();
    expect(plan.status).toBe("ready");
    expect(plan.publicationReady).toBe(false);
    expect(plan.persistedCleanup?.courseFields).toEqual(["grader_team", "grader_permission"]);
    expect(plan.persistedCleanup?.manifestPermissionFields).toEqual(["grader_team"]);
    expect(plan.audit.inventory).toEqual(f.inventory);
    expect(plan.facultyTerms).toEqual(f.review.terms);
    expect(plan.reconciliation.grants).toEqual([]);
    expect(f.plan()).toEqual(plan);
    frozen(plan);
    expect(JSON.stringify(f.inventory)).toBe(before);
    expect(Object.isFrozen(f.inventory)).toBe(false);
  });
  it("targets only the exact observed numeric legacy grant with a mandatory access verification gate", () => {
    const f = setup();
    f.inventory.status = "ready";
    f.inventory.candidate = {
      classification: "legacy_candidate",
      organizationId: required(f.analysis.source.organizationId),
      organizationLogin: f.analysis.source.organizationLogin,
      teamId: TEAM_ID,
      slug: "graders",
      membershipComplete: true,
      members: []
    };
    f.inventory.repositories = [
      {
        repositoryId: f.analysis.source.repositoryId,
        owner: f.analysis.source.organizationLogin,
        name: f.analysis.source.repositoryName,
        evidence: [
          {
            provenance: "course-config",
            location: "course.yml",
            repositoryId: f.analysis.source.repositoryId,
            repositoryName: f.analysis.source.repositoryName
          }
        ],
        associationsComplete: true,
        associations: [
          {
            teamId: TEAM_ID,
            slug: "graders",
            permission: "maintain",
            parentId: null,
            legacyCandidate: true
          },
          {
            teamId: OTHER_TEAM_ID,
            slug: "other",
            permission: "admin",
            parentId: null,
            legacyCandidate: false
          }
        ]
      }
    ];
    const plan = f.plan();
    expect(plan.reconciliation.grants).toHaveLength(1);
    expect(plan.reconciliation.grants[0]).toMatchObject({
      teamId: TEAM_ID,
      repositoryId: f.analysis.source.repositoryId,
      requires: "published_v2_and_verified_managed_replacement_access"
    });
    expect(plan.reconciliation.deleteTeam).toBe(false);
    expect(plan.reconciliation.deleteMemberships).toBe(false);
    required(f.inventory.repositories[0]).associationsComplete = false;
    expect(f.plan().reconciliation.grants).toEqual([]);
  });
  it("handles clean no-debt and manifest-only debt without inferred roles", () => {
    const input = fixture();
    const course = parse(required(input.sourceFiles["course.yml"])) as RawCourseConfigV1;
    delete course.github.grader_team;
    delete course.github.grader_permission;
    input.sourceFiles = { ...input.sourceFiles, "course.yml": stringify(course) };
    const clean = setup(reviewFixture(input));
    expect(clean.plan().audit.evidence).toEqual([]);
    expect(clean.plan().status).toBe("ready");
    addManifest(input);
    const debt = setup(reviewFixture(input));
    expect(debt.plan().audit.evidence.length).toBeGreaterThan(0);
    expect(debt.plan().facultyTerms).toEqual(debt.review.terms);
  });
  it("carries only explicit approved additions and rejects altered authorization", () => {
    const f = setup();
    f.inventory.status = "ready";
    f.inventory.candidate = {
      classification: "legacy_candidate",
      organizationId: required(f.analysis.source.organizationId),
      organizationLogin: f.analysis.source.organizationLogin,
      slug: "graders",
      teamId: TEAM_ID,
      membershipComplete: true,
      members: [{ id: OTHER_USER_ID, login: "github-smith" }]
    };
    const access = reviewGraderAccess(
      {
        inventoryId: "receipt",
        inventory: structuredClone(f.inventory),
        review: structuredClone(f.review)
      },
      {
        inventoryId: "receipt",
        decisions: [
          {
            githubUserId: OTHER_USER_ID,
            disposition: "assign",
            sections: [{ termCode: "27s1", sectionId: "002" }]
          }
        ]
      }
    );
    const plan = planGraderRemoval(f.analysis, f.review, f.assignmentPlan, f.inventory, access);
    expect(plan.status).toBe("ready");
    expect(plan.facultyTerms[0]?.sections[1]?.currentFacultyGithubUserIds).toContain(OTHER_USER_ID);
    expect(plan.facultyTerms[0]?.sections[0]).toEqual(f.review.terms[0]?.sections[0]);
    const altered = {
      ...access,
      terms: access.terms.map((t) => ({
        ...t,
        sections: t.sections.map((s) => ({ ...s, currentFacultyGithubUserIds: [] }))
      }))
    };
    expect(
      planGraderRemoval(f.analysis, f.review, f.assignmentPlan, f.inventory, altered).status
    ).toBe("blocked");
    const unresolved = structuredClone(f.inventory);
    required(unresolved.candidate).teamId = null;
    expect(
      planGraderRemoval(f.analysis, f.review, f.assignmentPlan, unresolved, access).status
    ).toBe("blocked");
  });
  it("has no I/O, clock, randomness or mutation capabilities", () => {
    const source = fs.readFileSync("src/migration/grader-removal-planner.ts", "utf8");
    const file = ts.createSourceFile("planner.ts", source, ts.ScriptTarget.Latest, true);
    const imports = file.statements
      .filter(ts.isImportDeclaration)
      .filter((s) => !s.getText(file).startsWith("import type"))
      .map((s) => (s.moduleSpecifier as ts.StringLiteral).text);
    expect(imports).toEqual([
      "./assignment-migration-planner.js",
      "./grader-access-review.js",
      "./migration-evidence.js",
      "../github/repository-team-permission-boundary.js"
    ]);
    expect(source).not.toMatch(/Date|Math\.random|process\.|fetch\(|writeFile|execSync/);
  });
  it("blocks mismatched source, assignment plan and grader review bindings", () => {
    const f = setup();
    const access = structuredClone(f.access());
    expect(
      planGraderRemoval(
        f.analysis,
        f.review,
        { ...f.assignmentPlan, source: { ...f.assignmentPlan.source, reportId: "wrong" } },
        f.inventory,
        access
      ).status
    ).toBe("blocked");
    const wrongAccess = { ...access, source: { ...access.source, reportId: "wrong" } };
    expect(
      planGraderRemoval(f.analysis, f.review, f.assignmentPlan, f.inventory, wrongAccess).status
    ).toBe("blocked");
    f.inventory.source.sourceCommitSha = "wrong";
    expect(f.plan().status).toBe("blocked");
  });
});
