import type { ReactElement } from "react";
import type { GradingStudentSnapshotResult } from "../../electron/ipc";

type Snapshot = Extract<GradingStudentSnapshotResult, { readonly status: "success" }>;
export type SnapshotGrade = Snapshot["grade"];

export const GradingScorePanel = ({ grade }: { readonly grade: SnapshotGrade }): ReactElement => (
  <section aria-labelledby="grading-score-heading">
    <h3 id="grading-score-heading">Score</h3>
    {grade.categories.length === 0 ? (
      <p className="grading-score-total">No rubric — enter a score manually</p>
    ) : (
      <p className="grading-score-total">
        {grade.totalScore} / {grade.pointsPossible}
      </p>
    )}
    {grade.categories.length === 0 ? (
      <p>No rubric categories are configured.</p>
    ) : (
      <ul className="grading-score-categories" aria-label="Rubric categories">
        {grade.categories.map((category) => (
          <li key={category.id}>
            <span>{category.name}</span>
            <span>
              {category.score} / {category.pointsPossible}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);
