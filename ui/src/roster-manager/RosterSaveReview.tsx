import type { ReactElement } from "react";
import type { RosterDiffResult } from "../../../src/roster/roster-shared";
import { ConfirmationWithPreviewModal } from "../components/ConfirmationWithPreviewModal";
import type { FacultyDiff } from "./rosterManagerModel";
import { getDiffTypeLabel, getRowDiffDetail } from "./rosterManagerModel";

export const RosterSaveReview = ({
  isOpen,
  diff,
  facultyDiff,
  isCreatingSection,
  onCancel,
  onConfirm,
  onSuccess
}: {
  readonly isOpen: boolean;
  readonly diff: RosterDiffResult;
  readonly facultyDiff: FacultyDiff;
  readonly isCreatingSection: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => Promise<void>;
  readonly onSuccess: (message: string) => void;
}): ReactElement => (
  <ConfirmationWithPreviewModal
    confirmLabel="Save roster"
    isOpen={isOpen}
    onCancel={onCancel}
    onConfirm={onConfirm}
    onSuccess={onSuccess}
    preview={
      <div className="roster-review-diff">
        {diff.rows.length === 0 ? (
          <p>No student-row changes.</p>
        ) : (
          <ul>
            {diff.rows.map((rowDiff, index) => (
              <li
                className={`roster-review-diff__row roster-review-diff__row--${rowDiff.changeType}`}
                key={`${rowDiff.changeType}-${rowDiff.studentId}-${String(index)}`}
              >
                <span>{getDiffTypeLabel(rowDiff)}</span>
                <strong>{rowDiff.studentId || "Student ID not set"}</strong>
                <p>{getRowDiffDetail(rowDiff)}</p>
              </li>
            ))}
          </ul>
        )}
        {!facultyDiff.changed ? null : (
          <div className="roster-review-faculty">
            <h3>Faculty assignment</h3>
            {facultyDiff.added.length === 0 ? null : (
              <p>Faculty added: {facultyDiff.added.join(", ")}</p>
            )}
            {facultyDiff.removed.length === 0 ? null : (
              <p>Faculty removed: {facultyDiff.removed.join(", ")}</p>
            )}
          </div>
        )}
      </div>
    }
    supplementalContent={
      <p className="roster-review-safety-note">
        Removing a student from the roster or marking them dropped does not delete their repository
        or published reports.
      </p>
    }
    successMessage="Roster saved."
    summary={
      <div className="roster-review-summary">
        {isCreatingSection ? <p>This will create the new section.</p> : null}
        <p>
          {diff.addedCount} added · {diff.droppedCount} removed · {diff.changedCount} changed
        </p>
        {facultyDiff.changed ? <p>Faculty assignment will also be updated.</p> : null}
      </div>
    }
    title="Review roster changes"
  />
);
