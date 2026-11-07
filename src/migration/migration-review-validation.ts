import { z } from "zod";
import { facultyIdentitySchema, TERM_LIFECYCLE_STATUSES } from "../config/config-schemas.js";
import type { CourseMigrationAnalysis, Immutable } from "./migration-models.js";
import type {
  MigrationReviewAcknowledgement,
  MigrationReviewContext,
  MigrationReviewResult,
  MigrationReviewResultData,
  MigrationReviewSource,
  MigrationReviewSubmission
} from "./migration-review-models.js";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1);
const sourceSchema = z
  .object({
    repositoryId: id,
    sourceCommitSha: text,
    reportId: text,
    authenticatedGithubUserId: id
  })
  .strict();
export const migrationReviewSubmissionSchema = z
  .object({
    source: sourceSchema,
    facultyMappings: z.array(
      z.object({ institutionalUsername: text, verificationId: text }).strict()
    ),
    fallbackAdministratorUsername: text.nullable(),
    creationOrder: z.object({ termCodes: z.array(text), confirmed: z.boolean() }).strict(),
    terms: z.array(
      z
        .object({
          termCode: text,
          currentCoordinatorUsernames: z.array(text),
          status: z.enum(TERM_LIFECYCLE_STATUSES).nullable(),
          hasEverBeenActive: z.boolean().nullable()
        })
        .strict()
    ),
    acknowledgements: z.array(
      z
        .object({
          kind: z.enum(["ownerless_assignment", "legacy_closed", "group_targets"]),
          termCode: text,
          assignmentSlug: text
        })
        .strict()
    )
  })
  .strict();

/** Browser-safe immutable review values; no I/O or provider capability. */
export const freezeMigrationReview = <T>(value: T): Immutable<T> => {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((item: unknown) => {
      freezeMigrationReview(item);
    });
    Object.freeze(value);
  }
  return value as Immutable<T>;
};
export const migrationReviewSource = (analysis: CourseMigrationAnalysis): MigrationReviewSource =>
  Object.freeze({
    repositoryId: analysis.source.repositoryId,
    sourceCommitSha: analysis.source.sourceCommitSha,
    reportId: analysis.reportId,
    authenticatedGithubUserId: analysis.source.authenticatedGithubUserId
  });
export const acknowledgementKey = (ack: MigrationReviewAcknowledgement): string =>
  `assignments/${ack.termCode}/${ack.assignmentSlug}/${ack.kind === "ownerless_assignment" ? "owner" : ack.kind === "legacy_closed" ? "status" : "group_targets"}`;
export const requiredMigrationAcknowledgements = (
  analysis: CourseMigrationAnalysis
): readonly MigrationReviewAcknowledgement[] => {
  const result: MigrationReviewAcknowledgement[] = [];
  for (const assignment of analysis.assignments) {
    const base = { termCode: assignment.termCode, assignmentSlug: assignment.slug };
    if (assignment.ownerlessRepairRequired) result.push({ ...base, kind: "ownerless_assignment" });
    if (assignment.status === "closed") result.push({ ...base, kind: "legacy_closed" });
    if (
      analysis.reviewDecisions.some(
        (decision) =>
          decision.key === `assignments/${assignment.termCode}/${assignment.slug}/group_targets`
      )
    )
      result.push({ ...base, kind: "group_targets" });
  }
  return freezeMigrationReview(result);
};
export const emptyMigrationReviewSubmission = (
  context: MigrationReviewContext
): MigrationReviewSubmission => ({
  source: migrationReviewSource(context.analysis),
  facultyMappings: context.verifiedFaculty.map((entry) => ({
    institutionalUsername: entry.identity.institutional_username,
    verificationId: entry.verificationId
  })),
  fallbackAdministratorUsername: null,
  creationOrder: {
    termCodes: [...(context.analysis.termCreationOrder.value ?? [])],
    confirmed: false
  },
  terms: context.analysis.terms.map((term) => ({
    termCode: term.code,
    currentCoordinatorUsernames: [],
    status: null,
    hasEverBeenActive: term.lifecycle.hasEverBeenActive.value
  })),
  acknowledgements: []
});

/** Trusted context is independent of the submission. No submitted ID or receipt creates authority. */
export const validateMigrationReview = (
  context: MigrationReviewContext,
  submitted: unknown
): MigrationReviewResult => {
  const { analysis } = context;
  const result: MigrationReviewResultData = {
    kind: "schema-v1-migration-review",
    status: "incomplete",
    source: migrationReviewSource(analysis),
    publicationReady: false,
    courseLifecycle: "unarchived",
    facultyDirectory: [],
    fallbackAdministratorGithubUserId: null,
    termCreationOrder: [],
    terms: [],
    acknowledgements: [],
    missingDecisions: [],
    errors: [],
    remainingIssues: structuredClone(
      analysis.issues
    ) as MigrationReviewResultData["remainingIssues"],
    publicationBlockers: analysis.issues
      .filter((issue) => issue.classification === "blocking")
      .map((issue) => `${issue.code}: ${issue.message}`),
    conversionNeedsAttention: [],
    deferredMigrationWork: [
      "9.3 assignment and Apply conversion",
      "9.4 grader debt reconciliation",
      "9.5 checkpoint, final validation and publication",
      ...analysis.preservation.deferredWork
    ],
    preservation: structuredClone(analysis.preservation),
    organizationCondition: analysis.organization.value,
    graderDebtPresent: analysis.grader.evidence.length > 0,
    assignmentReviewSummary: analysis.assignments.map((assignment) => ({
      termCode: assignment.termCode,
      slug: assignment.slug,
      legacyStatus: assignment.status,
      proposedOwnerGithubUserIds:
        assignment.owner.value === null ? null : [...assignment.owner.value],
      ownerlessRepairRequired: assignment.ownerlessRepairRequired,
      applyState: assignment.applyState
    }))
  };
  const error = (key: string, message: string) => {
    result.errors.push({ key, message });
  };
  const missing = (key: string, message: string) => {
    result.missingDecisions.push({ key, message });
  };
  if (analysis.organization.value !== "organization_reconciled")
    result.publicationBlockers.push(analysis.organization.value);
  if (result.graderDebtPresent)
    result.publicationBlockers.push("Legacy grader debt remains for Phase 9.4.");
  for (const issue of analysis.issues)
    result.conversionNeedsAttention.push(`${issue.code}: ${issue.message}`);
  for (const assignment of analysis.assignments)
    if (["ambiguous", "partial_incomplete"].includes(assignment.applyState))
      result.conversionNeedsAttention.push(
        `${assignment.termCode}/${assignment.slug}: ${assignment.applyState}`
      );
  const finish = (): MigrationReviewResult => {
    if (result.status !== "stale" && result.status !== "not_applicable")
      result.status =
        result.errors.length > 0
          ? "blocked"
          : result.missingDecisions.length > 0
            ? "incomplete"
            : "complete";
    return freezeMigrationReview(result);
  };
  if (analysis.status === "not_applicable") {
    result.status = "not_applicable";
    return finish();
  }
  if (
    !analysis.validatedMigrationFacts ||
    analysis.issues.some(
      (issue) =>
        issue.classification === "blocking" && issue.code !== "organization_migration_required"
    )
  )
    error(
      "analysis",
      "Foundational analysis is blocked. Repair or resolve the analysis before completing review."
    );
  const parsed = migrationReviewSubmissionSchema.safeParse(submitted);
  if (!parsed.success) {
    error(
      "submission",
      "Invalid review fields. Only typed review decisions and known acknowledgements are accepted."
    );
    return finish();
  }
  const submission = parsed.data;
  if (
    Object.entries(result.source).some(
      ([key, value]) => submission.source[key as keyof MigrationReviewSource] !== value
    )
  ) {
    error(
      "source",
      "Review belongs to a different repository, account, revision or analysis fingerprint."
    );
    return finish();
  }
  const directory = context.verifiedFaculty.map((entry) =>
    facultyIdentitySchema.safeParse(entry.identity)
  );
  if (directory.some((entry) => !entry.success))
    error("faculty", "A verified faculty record is invalid.");
  result.facultyDirectory = directory.flatMap((entry) => (entry.success ? [entry.data] : []));
  const usernames = result.facultyDirectory.map((entry) =>
    entry.institutional_username.toLowerCase()
  );
  const ids = result.facultyDirectory.map((entry) => entry.github_user_id);
  const logins = result.facultyDirectory.map((entry) => entry.github_login.toLowerCase());
  if (
    new Set(usernames).size !== usernames.length ||
    new Set(ids).size !== ids.length ||
    new Set(logins).size !== logins.length
  )
    error(
      "faculty",
      "Faculty institutional usernames, immutable IDs and current logins must each be unique."
    );
  const resolve = (username: string) =>
    result.facultyDirectory.find((entry) => entry.institutional_username === username);
  const supplied = new Set<string>();
  for (const selection of submission.facultyMappings) {
    const verified = context.verifiedFaculty.find(
      (entry) =>
        entry.identity.institutional_username === selection.institutionalUsername &&
        entry.verificationId === selection.verificationId
    );
    if (!verified || supplied.has(selection.institutionalUsername))
      error("faculty", "Unknown, duplicate or unverified faculty mapping.");
    supplied.add(selection.institutionalUsername);
  }
  for (const verified of context.verifiedFaculty)
    if (!supplied.has(verified.identity.institutional_username))
      missing(
        "faculty",
        `Review the verified mapping for ${verified.identity.institutional_username}.`
      );
  for (const identity of analysis.faculty) {
    const record = resolve(identity.institutionalUsername);
    if (identity.resolution.value === null || record === undefined)
      missing(
        `faculty/${identity.institutionalUsername}`,
        `Verify GitHub identity for ${identity.institutionalUsername}.`
      );
    else if (
      record.github_user_id !== identity.resolution.value.github_user_id ||
      record.github_login !== identity.resolution.value.github_login
    )
      error("faculty", "Reviewed faculty identity disagrees with authoritative analyzer evidence.");
  }
  const fallback = submission.fallbackAdministratorUsername;
  if (fallback === null)
    missing("fallback_administrator", "Select exactly one fallback administrator.");
  else if (!resolve(fallback))
    error(
      "fallback_administrator",
      "Fallback must reference a fully verified faculty-directory identity."
    );
  else result.fallbackAdministratorGithubUserId = resolve(fallback)?.github_user_id ?? null;
  const codes = analysis.terms.map((term) => term.code);
  if (!submission.creationOrder.confirmed)
    missing("term_creation_order", "Explicitly confirm the complete term creation order.");
  if (
    submission.creationOrder.termCodes.length !== codes.length ||
    new Set(submission.creationOrder.termCodes).size !== codes.length ||
    submission.creationOrder.termCodes.some((code) => !codes.includes(code))
  ) {
    if (!submission.creationOrder.confirmed)
      missing(
        "term_creation_order",
        "Construct an order containing every existing term exactly once."
      );
    else
      error(
        "term_creation_order",
        "Creation order must contain every existing canonical term exactly once."
      );
  }
  result.termCreationOrder = [...submission.creationOrder.termCodes];
  if (
    new Set(submission.terms.map((term) => term.termCode)).size !== submission.terms.length ||
    submission.terms.some((term) => !codes.includes(term.termCode))
  )
    error("terms", "Duplicate or unknown term decisions.");
  if (submission.terms.filter((term) => term.status === "active").length > 1)
    error("terms", "At most one term may be Active.");
  for (const term of analysis.terms) {
    const selected = submission.terms.find((item) => item.termCode === term.code);
    if (!selected) {
      missing(`terms/${term.code}`, "Review all term decisions.");
      continue;
    }
    if (selected.currentCoordinatorUsernames.length === 0)
      missing(
        `terms/${term.code}/coordinators.current`,
        "Select at least one current coordinator."
      );
    if (
      new Set(selected.currentCoordinatorUsernames).size !==
        selected.currentCoordinatorUsernames.length ||
      selected.currentCoordinatorUsernames.some((username) => !resolve(username))
    )
      error(
        `terms/${term.code}/coordinators.current`,
        "Coordinators must be distinct verified directory identities."
      );
    if (selected.status === null)
      missing(`terms/${term.code}/status`, "Choose the term lifecycle status.");
    const proven = term.lifecycle.hasEverBeenActive.value === true;
    if (proven && selected.hasEverBeenActive !== true)
      error(
        `terms/${term.code}/has_ever_been_active`,
        "Source-proven prior activity cannot be changed to false or unknown."
      );
    else if (selected.hasEverBeenActive === null)
      missing(
        `terms/${term.code}/has_ever_been_active`,
        "Explicitly choose yes or no for activation history."
      );
    if (
      (selected.status === "active" || selected.status === "archived") &&
      selected.hasEverBeenActive === false
    )
      error(
        `terms/${term.code}/has_ever_been_active`,
        "Active and Archived terms require prior activation history true."
      );
    result.terms.push({
      termCode: term.code,
      status: selected.status,
      hasEverBeenActive: proven ? true : selected.hasEverBeenActive,
      currentCoordinatorGithubUserIds: selected.currentCoordinatorUsernames.flatMap((username) => {
        const identity = resolve(username);
        return identity ? [identity.github_user_id] : [];
      }),
      sections: term.sections.map((section) => ({
        sectionId: section.id,
        currentFacultyGithubUserIds:
          section.proposedCurrentFacultyIds.value === null
            ? null
            : [...section.proposedCurrentFacultyIds.value]
      }))
    });
  }
  const required = requiredMigrationAcknowledgements(analysis);
  const knownKeys = new Set([
    "fallback_administrator",
    "term_creation_order",
    ...analysis.faculty.map((entry) => `faculty/${entry.institutionalUsername}`),
    ...codes.flatMap((code) => [
      `terms/${code}/coordinators.current`,
      `terms/${code}/status`,
      `terms/${code}/has_ever_been_active`
    ]),
    ...required.map(acknowledgementKey)
  ]);
  if (analysis.reviewDecisions.some((decision) => !knownKeys.has(decision.key)))
    error(
      "decisions",
      "Analysis contains an unknown review decision; this reviewer cannot complete it."
    );
  const acknowledged = new Set<string>();
  for (const ack of submission.acknowledgements) {
    const key = acknowledgementKey(ack);
    if (
      !required.some((item) => acknowledgementKey(item) === key) ||
      !analysis.reviewDecisions.some((decision) => decision.key === key) ||
      acknowledged.has(key)
    )
      error("acknowledgements", "Unknown, duplicate or inapplicable acknowledgement.");
    acknowledged.add(key);
  }
  for (const ack of required)
    if (!acknowledged.has(acknowledgementKey(ack)))
      missing(
        acknowledgementKey(ack),
        "Acknowledge the deferred assignment migration requirement."
      );
  result.acknowledgements = submission.acknowledgements.map((ack) => ({ ...ack }));
  return finish();
};
