import { isObjectId } from "../git/git-workspace.js";
import {
  MAX_REVIEW_FILES,
  REVIEW_SCHEMA_VERSION,
  reviewFindingKey,
  type Review
} from "./review-schema.js";
import {
  diagnostic,
  parseReviewInput,
  reviewFilename,
  type ReviewInput,
  type ReviewDiagnostic
} from "./review-input.js";
import {
  importCounts,
  type ReviewImportContext,
  type ReviewImportPlan,
  type ReviewPlan,
  type FindingPlan,
  type ReviewRepositoryReader,
  type ShaState
} from "./review-plan-models.js";
import { matchReviewStudent, mapReviewRubric, planReviewAnchor } from "./review-resolution.js";

const blocked = (
  filename: string,
  diagnostics: readonly ReviewDiagnostic[],
  review?: Review,
  status: "invalid" | "unmatched" = "invalid"
): ReviewPlan => ({
  filename,
  status,
  diagnostics,
  findings: [],
  findingCounts: importCounts([]),
  ...(review === undefined ? {} : { review })
});
const planReview = async (
  filename: string,
  review: Review,
  context: ReviewImportContext,
  seen: Set<string>
): Promise<ReviewPlan> => {
  for (const field of ["courseCode", "termCode", "assignmentSlug"] as const) {
    if (review.assignment[field] !== context.assignment[field])
      return blocked(
        filename,
        [
          diagnostic(
            field === "courseCode" ? "wrong_course" : "wrong_assignment",
            `Review ${field} does not match the selected assignment.`
          )
        ],
        review
      );
  }
  const match = matchReviewStudent(review, context);
  const submission = match.submission;
  if (submission === undefined)
    return blocked(
      filename,
      match.diagnostics,
      review,
      match.status === "unmatched" ? "unmatched" : "invalid"
    );
  const repository = submission.repository;
  if (
    repository === null ||
    repository.owner.toLowerCase() !== review.repository.owner.toLowerCase() ||
    repository.name.toLowerCase() !== review.repository.name.toLowerCase()
  )
    return blocked(
      filename,
      [
        diagnostic(
          "wrong_repository",
          "Review repository differs from the canonical student mapping."
        )
      ],
      review
    );
  if (submission.diagnostics.length > 0) return blocked(filename, submission.diagnostics, review);
  const currentSha = submission.currentCommitSha;
  if (currentSha === null || !isObjectId(currentSha))
    return blocked(
      filename,
      [diagnostic("submission_commit_unavailable", "Canonical submission SHA is unavailable.")],
      review
    );
  if (
    submission.gradingState !== null &&
    (submission.gradingState.studentId !== submission.student.studentId ||
      submission.gradingState.submissionCommitSha.toLowerCase() !== currentSha.toLowerCase())
  )
    return blocked(
      filename,
      [
        diagnostic(
          "grading_state_mismatch",
          "Grading state does not match the canonical student/submission."
        )
      ],
      review
    );
  let reader: ReviewRepositoryReader | null;
  let history: boolean | null = null;
  const reviewedSha = review.repository.reviewedCommitSha;
  const canonicalSha = currentSha.toLowerCase();
  try {
    reader = await context.repository(submission.student.studentId);
    if (reader !== null && !(await reader.matchesRepository(repository.owner, repository.name)))
      return blocked(
        filename,
        [
          diagnostic(
            "wrong_repository",
            "Local repository remote does not match the canonical mapping."
          )
        ],
        review
      );
    if (reader !== null) history = await reader.isInHistory(reviewedSha, canonicalSha);
  } catch {
    reader = null;
  }
  const shaState: ShaState =
    history === false
      ? "unrelated"
      : history === null
        ? "unavailable"
        : reviewedSha === canonicalSha
          ? "exact"
          : "changed";
  const diagnostics = [...match.diagnostics];
  if (shaState === "changed")
    diagnostics.push(
      diagnostic(
        "reviewed_sha_changed",
        "Reviewed SHA differs from the canonical submission; explicit recovery approval is required."
      )
    );
  if (shaState === "unavailable")
    diagnostics.push(
      diagnostic(
        "repository_history_unavailable",
        "Repository history could not be verified; findings cannot be applied."
      )
    );
  if (shaState === "unrelated")
    diagnostics.push(
      diagnostic(
        "unrelated_reviewed_sha",
        "Reviewed commit is not in canonical submission history."
      )
    );
  const existing = new Set(
    (submission.gradingState?.appliedComments ?? []).flatMap((comment) =>
      comment.importProvenance === undefined
        ? []
        : [reviewFindingKey(comment.importProvenance.reviewId, comment.importProvenance.findingId)]
    )
  );
  const findings: FindingPlan[] = [];
  for (const finding of review.findings) {
    const key = reviewFindingKey(review.reviewId, finding.id);
    const duplicate = existing.has(key) || seen.has(key);
    const rubric = mapReviewRubric(finding, context);
    const anchor = await planReviewAnchor(
      finding,
      reader,
      reviewedSha,
      canonicalSha,
      history === true
    );
    const findingDiagnostics = [...rubric.diagnostics, ...anchor.diagnostics];
    if (duplicate)
      findingDiagnostics.push(
        diagnostic(
          "finding_already_imported",
          "Finding already exists in grading state or an earlier file in this batch; preserve the existing comment."
        )
      );
    const invalid = shaState === "unrelated" || rubric.status === "unresolved";
    const eligibleToApply =
      !duplicate && !invalid && history === true && anchor.status !== "unresolved";
    const recoveryRequired = shaState === "changed" || anchor.status === "recoverable";
    const requiresApproval =
      recoveryRequired || diagnostics.length > 0 || findingDiagnostics.length > 0;
    const status =
      shaState === "unrelated"
        ? "invalid"
        : duplicate
          ? "duplicate"
          : invalid
            ? "invalid"
            : !eligibleToApply || requiresApproval
              ? "warning"
              : "ready";
    findings.push({
      finding,
      key,
      provenance: {
        source: "review_import",
        schemaVersion: REVIEW_SCHEMA_VERSION,
        reviewId: review.reviewId,
        findingId: finding.id
      },
      status,
      duplicate,
      rubric,
      anchor,
      diagnostics: findingDiagnostics,
      eligibleToApply,
      requiresApproval,
      recoveryRequired,
      operation: eligibleToApply ? "add_comment" : null
    });
    // Reserve only actual candidates. An unresolved earlier file cannot hide a later candidate.
    if (eligibleToApply) seen.add(key);
  }
  const status =
    shaState === "unrelated" || findings.some((finding) => finding.status === "invalid")
      ? "invalid"
      : findings.length > 0 && findings.every((finding) => finding.duplicate)
        ? "duplicate"
        : diagnostics.length > 0 || findings.some((finding) => finding.status === "warning")
          ? "warning"
          : "ready";
  return {
    filename,
    review,
    matchedStudent: { ...submission.student },
    currentCommitSha: canonicalSha,
    shaState,
    status,
    diagnostics,
    findings,
    findingCounts: importCounts(findings)
  };
};

/** Pure planning: no writes, comment creation, state changes or repository updates.
 * File order is stable; the first identical eligible finding reserves its key. */
export const planReviewImport = async (
  inputs: readonly ReviewInput[],
  context: ReviewImportContext
): Promise<ReviewImportPlan> => {
  const reviews: ReviewPlan[] = [];
  const diagnostics: ReviewDiagnostic[] = [];
  if (inputs.length > MAX_REVIEW_FILES)
    diagnostics.push(
      diagnostic("too_many_files", `Select at most ${String(MAX_REVIEW_FILES)} review files.`)
    );
  const parsed = inputs.length > MAX_REVIEW_FILES ? [] : inputs.map(parseReviewInput);
  const payloads = new Map<string, Set<string>>();
  for (const item of parsed) {
    if (item.status === "valid") {
      const variants = payloads.get(item.review.reviewId) ?? new Set<string>();
      // Informational generator/timestamp/display metadata never determines trust.
      variants.add(
        JSON.stringify({
          assignment: {
            courseCode: item.review.assignment.courseCode,
            termCode: item.review.assignment.termCode,
            assignmentSlug: item.review.assignment.assignmentSlug
          },
          student: {
            githubUsername: item.review.student.githubUsername,
            studentId: item.review.student.studentId
          },
          repository: item.review.repository,
          findings: item.review.findings
        })
      );
      payloads.set(item.review.reviewId, variants);
    }
  }
  const seen = new Set<string>();
  for (const [index, input] of inputs.entries()) {
    const filename = reviewFilename(input.filename);
    const item = parsed[index];
    if (item === undefined) reviews.push(blocked(filename, diagnostics));
    else if (item.status === "invalid") reviews.push(blocked(filename, item.diagnostics));
    else if ((payloads.get(item.review.reviewId)?.size ?? 0) > 1)
      reviews.push(
        blocked(
          filename,
          [
            diagnostic(
              "conflicting_review_id",
              "Files reuse a review ID with different content; resolve the conflict before importing."
            )
          ],
          item.review
        )
      );
    else reviews.push(await planReview(filename, item.review, context, seen));
  }
  const findings = reviews.flatMap((review) => review.findings);
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviews,
    diagnostics,
    summary: {
      totalFiles: inputs.length,
      ...importCounts(reviews),
      findingCounts: importCounts(findings),
      eligibleFindings: findings.filter((finding) => finding.eligibleToApply).length
    }
  };
};
