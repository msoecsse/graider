import type {
  ReviewImportContext,
  ReviewSubmission,
  RubricMapping,
  AnchorPlan,
  ReviewRepositoryReader
} from "./review-plan-models.js";
import type { Review, ReviewFinding } from "./review-schema.js";
import { diagnostic, type ReviewDiagnostic } from "./review-input.js";
import { exactSourceMatches, sourceLines } from "../grading/exact-source-anchor.js";

export interface StudentMatch {
  readonly status: "matched" | "unmatched" | "invalid";
  readonly submission?: ReviewSubmission;
  readonly diagnostics: readonly ReviewDiagnostic[];
}
export const matchReviewStudent = (review: Review, context: ReviewImportContext): StudentMatch => {
  const supplied = review.student;
  const github =
    supplied.githubUsername === undefined
      ? []
      : context.submissions.filter(
          ({ student }) =>
            student.githubUsername.toLowerCase() === supplied.githubUsername?.toLowerCase()
        );
  const msoe =
    supplied.studentId === undefined
      ? []
      : context.submissions.filter(({ student }) => student.studentId === supplied.studentId);
  const fail = (status: "invalid" | "unmatched", code: string, message: string): StudentMatch => ({
    status,
    diagnostics: [diagnostic(code, message)]
  });
  if (github.length > 1 || msoe.length > 1)
    return fail(
      "invalid",
      "ambiguous_student",
      "Student identity matches multiple roster entries."
    );
  if (
    supplied.githubUsername !== undefined &&
    supplied.studentId !== undefined &&
    github[0] !== msoe[0]
  )
    return fail(
      "invalid",
      "student_identity_conflict",
      "GitHub and MSOE identities do not resolve to the same student."
    );
  const submission = github[0] ?? msoe[0];
  if (submission === undefined)
    return fail(
      "unmatched",
      "student_not_found",
      "No matching student in this assignment and faculty scope."
    );
  return {
    status: "matched",
    submission,
    diagnostics:
      supplied.githubUsername === undefined || supplied.studentId === undefined
        ? [
            diagnostic(
              "partial_student_identity",
              "Only one primary student identity was supplied."
            )
          ]
        : []
  };
};

export const mapReviewRubric = (
  finding: ReviewFinding,
  context: ReviewImportContext
): RubricMapping => {
  const reference = finding.rubric;
  if (reference === undefined) return { status: "general", diagnostics: [] };
  if (reference.id !== undefined) {
    const matches = context.rubric.filter((category) => category.id === reference.id);
    const category = matches[0];
    return matches.length === 1 && category !== undefined
      ? {
          status: "exact",
          categoryId: category.id,
          diagnostics:
            reference.name !== undefined && reference.name !== category.name
              ? [diagnostic("rubric_name_changed", "Rubric ID matches; its display name differs.")]
              : []
        }
      : {
          status: "unresolved",
          diagnostics: [
            diagnostic(
              "rubric_item_not_found",
              "Rubric ID is missing or ambiguous; no name fallback was attempted."
            )
          ]
        };
  }
  const matches = context.rubric.filter((category) => category.name === reference.name);
  const category = matches[0];
  return matches.length === 1 && category !== undefined
    ? {
        status: "fallback",
        categoryId: category.id,
        diagnostics: [
          diagnostic(
            "rubric_name_fallback",
            "Unique exact rubric name matched; instructor approval is required."
          )
        ]
      }
    : {
        status: "unresolved",
        diagnostics: [
          diagnostic(
            matches.length > 1 ? "ambiguous_rubric_mapping" : "rubric_item_not_found",
            "Rubric name does not identify exactly one category."
          )
        ]
      };
};

export const planReviewAnchor = async (
  finding: ReviewFinding,
  reader: ReviewRepositoryReader | null,
  reviewedSha: string,
  currentSha: string,
  historyVerified: boolean
): Promise<AnchorPlan> => {
  const original = finding.sourceLocation;
  if (original === undefined) return { status: "general", diagnostics: [] };
  const unresolved = (code: string, message: string): AnchorPlan => ({
    status: "unresolved",
    original,
    diagnostics: [diagnostic(code, message)]
  });
  if (reader === null || !historyVerified)
    return unresolved(
      "anchor_unverified",
      "Repository history must be verified before source anchors can be trusted."
    );
  let before: string | null;
  let after: string | null;
  try {
    before = await reader.readRevisionFile(reviewedSha, original.file);
    after =
      reviewedSha === currentSha
        ? before
        : await reader.readRevisionFile(currentSha, original.file);
  } catch {
    return unresolved("source_read_failed", "Source could not be read at the recorded revisions.");
  }
  if (before === null || after === null)
    return unresolved("source_file_missing", "Source file is missing at a recorded revision.");
  const excerpt = sourceLines(original.excerpt);
  if (excerpt.every((line) => line.trim() === ""))
    return unresolved(
      "anchor_context_missing",
      "Whitespace-only source cannot establish a safe anchor."
    );
  if (
    sourceLines(before)
      .slice(original.startLine - 1, original.endLine)
      .join("\n") !== excerpt.join("\n")
  )
    return unresolved(
      "anchor_context_mismatch",
      "Reviewed lines do not match the exact recorded source context."
    );
  const proposed = {
    file: original.file,
    startLine: original.startLine,
    endLine: original.endLine
  };
  if (reviewedSha === currentSha) return { status: "ready", original, proposed, diagnostics: [] };
  const matches = exactSourceMatches(after, original.excerpt);
  const startLine = matches[0];
  return matches.length === 1 && startLine !== undefined
    ? {
        status: "recoverable",
        original,
        proposed: { file: original.file, startLine, endLine: startLine + excerpt.length - 1 },
        diagnostics: [
          diagnostic(
            "anchor_recovery_required",
            "Exact context occurs once in the same file; instructor recovery approval is required."
          )
        ]
      }
    : unresolved(
        matches.length > 1 ? "ambiguous_anchor_recovery" : "anchor_context_missing",
        "Exact context does not occur uniquely in the current source file."
      );
};
