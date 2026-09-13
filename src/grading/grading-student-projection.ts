import type { GradingState, GradingStateResult } from "./grading-state.js";
import {
  calculateGrade,
  type GradeCalculation,
  type RubricCategory
} from "./grading-state-operations.js";

export interface GradingStudentProjection {
  readonly studentId: string;
  readonly gradingStatus: GradingState["status"];
  readonly appliedComments: GradingState["appliedComments"];
  readonly manualAdjustments: GradingState["manualAdjustments"];
  readonly grade: GradeCalculation;
}

export const projectGradingStudent = (
  state: GradingState,
  rubric: readonly RubricCategory[]
): GradingStateResult<GradingStudentProjection> => {
  const grade = calculateGrade(state, rubric);
  return grade.status === "failure"
    ? grade
    : {
        status: "success",
        value: {
          studentId: state.studentId,
          gradingStatus: state.status,
          appliedComments: state.appliedComments,
          manualAdjustments: state.manualAdjustments,
          grade: grade.value
        }
      };
};
