import fs from "node:fs";
import { stringify, parse } from "yaml";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
import { loadMigrationReviewBackend } from "./migrationReviewService.js";

export const REVIEW_REPO = 700;
export const REVIEW_USER = 101;
export const REVIEW_ORG = 800;
export const REVIEW_OTHER_USER = 102;
export const REVIEW_SHA = "a".repeat(40);
export const REVIEW_NEW_SHA = "b".repeat(40);
export const REVIEW_SELECTOR = `managed-course:${REVIEW_USER}:${REVIEW_REPO}`;
export const migrationSnapshotFixture = (resolved = true): Backend.MigrationSnapshot => ({
  binding: {
    repositoryId: REVIEW_REPO,
    sourceCommitSha: REVIEW_SHA,
    authenticatedGithubUserId: REVIEW_USER,
    organizationId: REVIEW_ORG,
    historicalOrganizationId: REVIEW_ORG,
    historicalRepositoryId: REVIEW_REPO,
    organizationLogin: "example-org",
    repositoryName: "se2030-graider"
  },
  sourceFiles: {
    "course.yml": fs.readFileSync("../tests/fixtures/config/valid-course/course.yml", "utf8"),
    "terms/27s1/term.yml": stringify({
      schema_version: 1,
      term: { code: "27s1", academic_year: 2027, semester: 1, display_name: "Spring" },
      sections: [{ id: "001", faculty: ["prof"] }]
    }),
    "terms/27s1/assignments/lab04/assignment.yml": stringify({
      schema_version: 1,
      assignment: { slug: "lab04", title: "Lab 04", type: "individual", status: "active" },
      sections: ["001"],
      metadata: { faculty_owner: "prof" }
    })
  },
  runtime: { coverage: "unavailable", files: {} },
  trustedIdentities: resolved
    ? [
        {
          institutionalUsername: "prof",
          githubUserId: REVIEW_USER,
          githubLogin: "faculty-now",
          githubLoginHistory: ["faculty-old"],
          provenance: "trusted-identity-evidence",
          reference: "verified-before-review"
        }
      ]
    : []
});
export const migrationViewFixture = (
  input = migrationSnapshotFixture()
): Backend.MigrationReviewSessionView => {
  const backend = loadMigrationReviewBackend();
  const analysis = backend.analyzeSchemaV1Migration(input);
  return {
    sessionId: "review-session",
    selector: REVIEW_SELECTOR,
    analysis,
    verifiedFaculty: analysis.provisionalFacultyDirectory.value.map((identity) => ({
      identity,
      verificationId: `verified:${identity.institutional_username}`,
      origin: "analysis"
    }))
  };
};
export const reviewedSubmissionFixture = (
  view: Backend.MigrationReviewSessionView
): Backend.MigrationReviewSubmission => ({
  ...loadMigrationReviewBackend().emptyMigrationReviewSubmission(view),
  fallbackAdministratorUsername: "prof",
  creationOrder: { termCodes: view.analysis.terms.map((term) => term.code), confirmed: true },
  terms: view.analysis.terms.map((term) => ({
    termCode: term.code,
    currentCoordinatorUsernames: ["prof"],
    status: "draft",
    hasEverBeenActive: term.lifecycle.hasEverBeenActive.value ?? false
  }))
});
export const extraTermFixture = (snapshot: Backend.MigrationSnapshot) => ({
  ...snapshot,
  sourceFiles: {
    ...snapshot.sourceFiles,
    "terms/26s3/term.yml": stringify({
      schema_version: 1,
      term: {
        code: "26s3",
        academic_year: 2026,
        semester: 3,
        display_name: "Earlier academic term"
      },
      sections: [{ id: "001", faculty: ["prof"] }]
    })
  }
});
export const courseV2Fixture = (): string =>
  fs.readFileSync("../tests/fixtures/config/schema-v2-course.yml", "utf8");
export const unsupportedCourseFixture = (): string =>
  stringify({
    ...(parse(
      fs.readFileSync("../tests/fixtures/config/valid-course/course.yml", "utf8")
    ) as object),
    schema_version: 3
  });
