import type { ReactElement } from "react";
import type { AssignmentGroupConfigResult } from "../../electron/ipc";

export const GroupRepositoryModePanel = ({
  groupConfig,
  groupMode,
  groupsCsv,
  isSavingGroupConfig,
  groupConfigFeedback,
  onGroupModeChange,
  onGroupsCsvChange,
  onSave
}: {
  readonly groupConfig: AssignmentGroupConfigResult;
  readonly groupMode: "individual" | "group";
  readonly groupsCsv: string;
  readonly isSavingGroupConfig: boolean;
  readonly groupConfigFeedback: string | null;
  readonly onGroupModeChange: (mode: "individual" | "group") => void;
  readonly onGroupsCsvChange: (value: string) => void;
  readonly onSave: () => void;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="repository-mode-title">
    <h2 id="repository-mode-title" tabIndex={-1}>
      Repository mode
    </h2>
    <label>
      Repository mode
      <select
        value={groupMode}
        onChange={(event) => onGroupModeChange(event.target.value as "individual" | "group")}
      >
        <option value="individual">Individual repositories</option>
        <option value="group">Group repositories</option>
      </select>
    </label>
    {groupMode === "group" ? (
      <>
        <p className="detail-panel__note">
          Apply creates one shared repository per group. Use Preview apply to verify group
          membership and repository targets before applying changes.
        </p>
        <label>
          Group membership CSV
          <textarea
            aria-label="Group membership CSV"
            value={groupsCsv}
            rows={8}
            onChange={(event) => onGroupsCsvChange(event.target.value)}
          />
        </label>
        <p className="detail-panel__note">
          {String(groupConfig.groupCount)} groups, {String(groupConfig.groupedStudentCount)}
          {" grouped students, "}
          {String(groupConfig.ungroupedActiveStudentCount)} ungrouped active students.
        </p>
      </>
    ) : groupConfig.groupsCsv.trim() !== "group_id,student_id" ? (
      <p className="detail-panel__note">
        Existing groups.csv is retained and ignored while Individual repositories is selected.
      </p>
    ) : null}
    <button
      className="primary-action"
      type="button"
      disabled={isSavingGroupConfig}
      onClick={onSave}
    >
      {isSavingGroupConfig ? "Saving repository mode..." : "Save repository mode"}
    </button>
    {groupConfigFeedback === null ? null : <p role="status">{groupConfigFeedback}</p>}
  </section>
);
