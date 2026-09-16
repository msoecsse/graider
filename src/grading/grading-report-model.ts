import type { RawAssignmentConfig, RawCourseConfig } from "../config/config-models.js";
import type { GradingEvidence } from "./grading-evidence-parser.js";
import type { GradingState, GradingStateResult } from "./grading-state.js";
import type { GradeCalculation, RubricCategory } from "./grading-state-operations.js";
import { projectGradingStudent } from "./grading-student-projection.js";
import type { SubmissionSourceModel } from "./submission-source.js";
import { commentScoreAdjustment } from "./comment-score-adjustment.js";

type AppliedComment = GradingState["appliedComments"][number];
type ManualAdjustment = GradingState["manualAdjustments"][number];

export type GradingReportCourseIdentity = Pick<RawCourseConfig["course"], "code" | "title">;
export type GradingReportAssignmentIdentity = Pick<
  RawAssignmentConfig["assignment"],
  "slug" | "title"
>;

export interface GradingReportEvidenceInput {
  readonly studentId: string;
  readonly submissionCommitSha: string;
  readonly evidence: GradingEvidence;
}

export interface GradingReportCommit {
  readonly sha: string;
  readonly committedAt: string;
  readonly message: string;
}

export interface GradingReportCommitHistoryInput {
  readonly studentId: string;
  readonly submissionCommitSha: string;
  readonly commits: readonly GradingReportCommit[];
}

export interface BuildGradingReportModelInput {
  readonly course: GradingReportCourseIdentity;
  readonly assignment: GradingReportAssignmentIdentity;
  readonly gradingState: GradingState;
  readonly rubric: readonly RubricCategory[];
  readonly source: SubmissionSourceModel;
  readonly evidence?: GradingReportEvidenceInput;
  readonly commitHistory?: GradingReportCommitHistoryInput;
}

export interface GradingReportComment {
  readonly reportIndex: number;
  readonly id: string;
  readonly title?: string;
  readonly text: string;
  readonly deduction: number;
  readonly rubricCategoryId?: string;
  readonly rubricCategoryName?: string;
  readonly sourceLocation?: AppliedComment["sourceLocation"];
  readonly locationAvailable: boolean;
}

export interface GradingReportManualAdjustment {
  readonly id: string;
  readonly rubricCategoryId: string;
  readonly rubricCategoryName: string;
  readonly amount: number;
  readonly note?: string;
}

export interface GradingReportFoundSourceFile {
  readonly status: "found";
  readonly fileIndex: number;
  readonly file: string;
  readonly lines: readonly string[];
  readonly comments: readonly GradingReportComment[];
}

export interface GradingReportMissingSourceFile {
  readonly status: "missing";
  readonly fileIndex: number;
  readonly file: string;
  readonly comments: readonly GradingReportComment[];
}

export type GradingReportSourceFile = GradingReportFoundSourceFile | GradingReportMissingSourceFile;

export interface GradingReportModel {
  readonly course: GradingReportCourseIdentity;
  readonly assignment: GradingReportAssignmentIdentity;
  readonly studentId: string;
  readonly submissionCommitSha: string;
  readonly gradingStatus: GradingState["status"];
  readonly grade: GradeCalculation;
  readonly generalComments: readonly GradingReportComment[];
  readonly sourceFiles: readonly GradingReportSourceFile[];
  readonly unmappedSourceComments: readonly GradingReportComment[];
  readonly manualAdjustments: readonly GradingReportManualAdjustment[];
  readonly evidence?: GradingEvidence;
  readonly commitHistory?: readonly GradingReportCommit[];
}

const failure = (code: string, message: string): GradingStateResult<never> => ({
  status: "failure",
  code,
  message
});

const normalizedSourceLines = (sourceText: string): readonly string[] =>
  sourceText.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").split("\n");

const sameSubmissionIdentity = (
  identity: { readonly studentId: string; readonly submissionCommitSha: string },
  state: GradingState
): boolean =>
  identity.studentId === state.studentId &&
  identity.submissionCommitSha === state.submissionCommitSha;

const reportComment = (
  comment: AppliedComment,
  reportIndex: number,
  rubricNames: ReadonlyMap<string, string>,
  locationAvailable: boolean
): GradingReportComment => ({
  reportIndex,
  id: comment.id,
  ...(comment.title === undefined ? {} : { title: comment.title }),
  text: comment.text,
  deduction: commentScoreAdjustment(comment.deduction),
  ...(comment.rubricCategoryId === undefined
    ? {}
    : {
        rubricCategoryId: comment.rubricCategoryId,
        rubricCategoryName: rubricNames.get(comment.rubricCategoryId) ?? comment.rubricCategoryId
      }),
  ...(comment.sourceLocation === undefined ? {} : { sourceLocation: comment.sourceLocation }),
  locationAvailable
});

export const buildGradingReportModel = (
  input: BuildGradingReportModelInput
): GradingStateResult<GradingReportModel> => {
  const projection = projectGradingStudent(input.gradingState, input.rubric);
  if (projection.status === "failure") return projection;

  if (
    input.evidence !== undefined &&
    (!sameSubmissionIdentity(input.evidence, input.gradingState) ||
      input.evidence.evidence.metadata.submissionCommitSha !==
        input.gradingState.submissionCommitSha)
  )
    return failure(
      "report_evidence_identity_mismatch",
      "Automated evidence does not match the grading submission identity."
    );

  if (
    input.commitHistory !== undefined &&
    !sameSubmissionIdentity(input.commitHistory, input.gradingState)
  )
    return failure(
      "report_commit_history_identity_mismatch",
      "Commit history does not match the grading submission identity."
    );

  const rubricNames = new Map(input.rubric.map((category) => [category.id, category.name]));
  const indexedComments = input.gradingState.appliedComments.map((comment, index) => ({
    comment,
    reportIndex: index + 1
  }));
  const generalComments = indexedComments
    .filter(({ comment }) => comment.sourceLocation === undefined)
    .map(({ comment, reportIndex }) => reportComment(comment, reportIndex, rubricNames, false));

  const mappedCommentIds = new Set<string>();
  const sourceFiles: GradingReportSourceFile[] = input.source.sections.map((section, index) => {
    const fileIndex = index + 1;
    const lines =
      section.status === "found" ? normalizedSourceLines(section.sourceText) : undefined;
    const comments = indexedComments
      .filter(({ comment }) => comment.sourceLocation?.file === section.file)
      .map(({ comment, reportIndex }) => {
        const location = comment.sourceLocation;
        const locationAvailable =
          lines !== undefined &&
          location !== undefined &&
          location.startLine <= location.endLine &&
          location.endLine <= lines.length;
        if (locationAvailable) mappedCommentIds.add(comment.id);
        return reportComment(comment, reportIndex, rubricNames, locationAvailable);
      });

    return section.status === "found"
      ? { status: "found", fileIndex, file: section.file, lines: lines ?? [], comments }
      : { status: "missing", fileIndex, file: section.file, comments };
  });

  const unmappedSourceComments = indexedComments
    .filter(
      ({ comment }) => comment.sourceLocation !== undefined && !mappedCommentIds.has(comment.id)
    )
    .map(({ comment, reportIndex }) => reportComment(comment, reportIndex, rubricNames, false));

  const manualAdjustments: GradingReportManualAdjustment[] =
    input.gradingState.manualAdjustments.map((adjustment: ManualAdjustment) => ({
      id: adjustment.id,
      rubricCategoryId: adjustment.rubricCategoryId,
      rubricCategoryName:
        rubricNames.get(adjustment.rubricCategoryId) ?? adjustment.rubricCategoryId,
      amount: adjustment.amount,
      ...(adjustment.note === undefined ? {} : { note: adjustment.note })
    }));

  return {
    status: "success",
    value: {
      course: { code: input.course.code, title: input.course.title },
      assignment: { slug: input.assignment.slug, title: input.assignment.title },
      studentId: projection.value.studentId,
      submissionCommitSha: input.gradingState.submissionCommitSha,
      gradingStatus: projection.value.gradingStatus,
      grade: projection.value.grade,
      generalComments,
      sourceFiles,
      unmappedSourceComments,
      manualAdjustments,
      ...(input.evidence === undefined ? {} : { evidence: input.evidence.evidence }),
      ...(input.commitHistory === undefined ? {} : { commitHistory: input.commitHistory.commits })
    }
  };
};
