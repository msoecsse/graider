import { analyzeSchemaV1Migration } from "../../../src/migration/schema-v1-migration-analyzer.js";
import {
  emptyMigrationReviewSubmission,
  requiredMigrationAcknowledgements
} from "../../../src/migration/migration-review-validation.js";
import type {
  MigrationReviewContext,
  MigrationReviewSubmission
} from "../../../src/migration/migration-review-models.js";
import { fixture } from "./migration-fixtures.js";

export const reviewFixture = (input = fixture()): MigrationReviewContext => {
  const analysis = analyzeSchemaV1Migration(input);
  return {
    analysis,
    verifiedFaculty: analysis.provisionalFacultyDirectory.value.map((identity) => ({
      identity,
      verificationId: `verified:${identity.institutional_username}`,
      origin: "analysis"
    }))
  };
};
export const completeSubmission = (context: MigrationReviewContext): MigrationReviewSubmission => ({
  ...emptyMigrationReviewSubmission(context),
  fallbackAdministratorUsername: "jones",
  creationOrder: { termCodes: context.analysis.terms.map((term) => term.code), confirmed: true },
  terms: context.analysis.terms.map((term) => ({
    termCode: term.code,
    currentCoordinatorUsernames: ["jones"],
    status: "draft",
    hasEverBeenActive: term.lifecycle.hasEverBeenActive.value ?? false
  })),
  acknowledgements: requiredMigrationAcknowledgements(context.analysis)
});
