import {
  buildMigrationCandidate,
  STAGED_PHASE_9_BOUNDARY
} from "../../../src/migration/migration-candidate.js";
import {
  migrationPublicationBinding,
  validateMigrationPublication,
  type MigrationCompatibilityEvidence,
  type MigrationPublicationContext
} from "../../../src/migration/migration-publication-validation.js";
import { reviewFixture, completeSubmission } from "./migration-review-fixtures.js";
import { validateMigrationReview } from "../../../src/migration/migration-review-validation.js";
import { planAssignmentMigration } from "../../../src/migration/assignment-migration-planner.js";
import { planGraderRemoval } from "../../../src/migration/grader-removal-planner.js";
import { reviewGraderAccess } from "../../../src/migration/grader-access-review.js";
import type { LegacyGraderInventoryData } from "../../../src/migration/legacy-grader-models.js";
import { freeze } from "../../../src/migration/migration-evidence.js";
import { stringify } from "yaml";
import type { MigrationSnapshot } from "../../../src/migration/migration-models.js";
import {
  fixture,
  course,
  term,
  assignment,
  putTerm,
  OTHER_ORGANIZATION_ID
} from "./migration-fixtures.js";

/** Fictional, deterministic snapshots; directly materializable with copyFixtureFiles in local Git. */
export interface SyntheticCourseOptions {
  sourceSha?: string;
  lifecycle?: "active" | "archived";
  authorization?: readonly string[];
  sourceFiles?: Record<string, string>;
  runtimeFiles?: Record<string, string>;
  studentObservations?: MigrationSnapshot["studentObservations"];
}
const SHA_LENGTH = 40;
export const gradingPath = ".graider/grading/27s1/lab04/state/student001.json";
export const commentPath = ".graider/grading/comments.json";
export const gradingRecord = () => ({
  schemaVersion: 1,
  studentId: "student001",
  submissionCommitSha: "e".repeat(SHA_LENGTH),
  status: "in_progress",
  appliedComments: [
    {
      id: "applied-one",
      sourceCommentId: "missing-library-entry",
      text: "Fictional snapshot",
      deduction: -1
    }
  ],
  manualAdjustments: []
});
export const BasicCourse = (options: SyntheticCourseOptions = {}): MigrationSnapshot => {
  const input = fixture();
  const config = structuredClone(course);
  config.course.repository = "fictional-course";
  config.github.organization = "fictional-academy";
  delete config.github.grader_team;
  delete config.github.grader_permission;
  input.binding.repositoryName = config.course.repository;
  input.binding.organizationLogin = config.github.organization;
  input.sourceFiles = { "course.yml": stringify(config) };
  const single = structuredClone(term);
  single.sections = [
    { id: "001", faculty: [...(options.authorization ?? ["jones"])], roster: "rosters/001.csv" }
  ];
  const task = structuredClone(assignment);
  task.sections = ["001"];
  task.assignment.status = options.lifecycle ?? "active";
  putTerm(input, single, [task]);
  input.sourceFiles = {
    ...input.sourceFiles,
    [gradingPath]: JSON.stringify(gradingRecord()),
    ...options.sourceFiles
  };
  if (options.sourceSha) {
    input.binding.sourceCommitSha = options.sourceSha;
    if (input.history)
      input.history = {
        ...input.history,
        sourceCommitSha: options.sourceSha,
        commits: input.history.commits.map((commit) =>
          commit.sha === fixture().binding.sourceCommitSha
            ? { ...commit, sha: input.binding.sourceCommitSha }
            : commit
        )
      };
  }
  if (options.runtimeFiles)
    input.runtime = { coverage: "machine_local", files: options.runtimeFiles };
  if (options.studentObservations) input.studentObservations = options.studentObservations;
  return input;
};
export const MultiSectionCourse = (options: SyntheticCourseOptions = {}) => {
  const input = BasicCourse(options);
  putTerm(input);
  const historical = structuredClone(term);
  historical.term = {
    code: "26s2",
    academic_year: 2026,
    semester: 2,
    display_name: "Fictional autumn"
  };
  const task = structuredClone(assignment);
  task.assignment.slug = "lab05";
  putTerm(input, historical, [task]);
  return input;
};
export const HistoricalCourse = (options: SyntheticCourseOptions = {}) =>
  BasicCourse({ lifecycle: "archived", ...options });
export const IncompleteCourse = (options: SyntheticCourseOptions = {}) =>
  BasicCourse({ sourceFiles: { [gradingPath]: "{damaged" }, ...options });
export const ConflictCourse = (options: SyntheticCourseOptions = {}) => {
  const input = BasicCourse(options);
  input.binding.historicalOrganizationId = OTHER_ORGANIZATION_ID;
  return input;
};

/** V1 has no term lifecycle/history fields. Supply archived decisions through review,
 * rather than inventing source metadata or former faculty intervals. */
export const historicalCourseReview = (options: SyntheticCourseOptions = {}) => {
  const input = HistoricalCourse(options);
  const context = reviewFixture(input);
  const submitted = completeSubmission(context);
  const submission = {
    ...submitted,
    terms: submitted.terms.map((entry) => ({
      ...entry,
      status: "archived" as const,
      hasEverBeenActive: true
    }))
  };
  return { input, context, submission };
};

/** Exact synthetic trusted pipeline artifacts; no live resource observations. */
export const completeSyntheticMigration = (
  input: MigrationSnapshot,
  statuses?: readonly ("draft" | "active" | "archived")[]
) => {
  const base = reviewFixture(input);
  const context = {
    ...base,
    verifiedFaculty:
      base.verifiedFaculty.length > 0
        ? base.verifiedFaculty
        : (input.trustedIdentities ?? []).map((entry) => ({
            identity: {
              institutional_username: entry.institutionalUsername,
              github_user_id: entry.githubUserId,
              github_login: entry.githubLogin,
              github_login_history: [...(entry.githubLoginHistory ?? [])]
            },
            verificationId: `verified:${entry.institutionalUsername}`,
            origin: "explicit_addition" as const
          }))
  };
  const submission = completeSubmission(context);
  const review = validateMigrationReview(context, {
    ...submission,
    creationOrder: {
      termCodes: [...submission.creationOrder.termCodes].reverse(),
      confirmed: true
    },
    terms: submission.terms.map((entry, index) => {
      const status = statuses?.[index] ?? entry.status;
      return {
        ...entry,
        status,
        hasEverBeenActive: status === "draft" ? entry.hasEverBeenActive : true
      };
    })
  });
  const analysis = context.analysis;
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
  const access = reviewGraderAccess(
    { inventoryId: "fictional-inventory", inventory, review },
    { inventoryId: "fictional-inventory", decisions: [] }
  );
  const graderRemovalPlan = planGraderRemoval(analysis, review, assignmentPlan, inventory, access);
  return {
    snapshot: freeze(structuredClone(input)),
    analysis,
    review,
    assignmentPlan,
    graderRemovalPlan
  };
};

/** Explicit implementation-only evidence. It cannot establish production enablement.
 * The validator has no production evidence provider; no live release dependency exists. */
export const syntheticPublicationFixture = (
  snapshot = BasicCourse(),
  statuses?: readonly ("draft" | "active" | "archived")[]
) => {
  const artifacts = {
    ...completeSyntheticMigration(snapshot, statuses),
    boundary: STAGED_PHASE_9_BOUNDARY
  };
  const candidate = buildMigrationCandidate(artifacts);
  const binding = migrationPublicationBinding(artifacts, candidate, {
    sessionId: "fictional-session",
    completionId: "fictional-completion",
    generation: 1
  });
  const compatibility: MigrationCompatibilityEvidence = {
    scope: "synthetic",
    observationId: "fictional-observation",
    binding,
    operationalSchema: 2,
    safeguards: {
      access: true,
      unsupportedSchema: true,
      staleCache: true,
      legacyMutations: true,
      authoritativeRevision: true,
      overwrite: true,
      downgrade: true
    },
    acknowledgement: {
      binding,
      githubUserId: binding.authenticatedGithubUserId,
      consequence: "incompatible-clients-lose-access-until-update"
    },
    releases: {
      macosArm64: "verified",
      windowsX64: "verified",
      signing: "verified",
      distribution: "verified",
      updates: "verified"
    }
  };
  const context: MigrationPublicationContext = {
    artifacts,
    candidate,
    binding,
    current: binding,
    authorizedFaculty: true,
    environment: "synthetic",
    observationId: compatibility.observationId,
    compatibility
  };
  const request = { candidate, binding };
  return { context, request, run: () => validateMigrationPublication(context, request) };
};
