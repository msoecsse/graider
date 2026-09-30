import type { ReactElement } from "react";
import type { RosterRow } from "../../electron/ipc";
import type { RosterRowDiff } from "../../../src/roster/roster-shared";
import { OverflowMenu } from "../components/OverflowMenu";
import { StatusChip, type StatusChipVariant } from "../components/StatusChip";
import { getRosterStatusLabel, type RosterDraftRow } from "./rosterManagerModel";

const getStatusVariant = (status: string): StatusChipVariant => {
  if (status === "dropped") return "error";
  if (status === "hold") return "warning";
  return "success";
};

const getCurrentDiff = (
  row: RosterRow,
  diffs: readonly RosterRowDiff[]
): RosterRowDiff | undefined => diffs.find((diff) => diff.current === row);

export const RosterStudentTable = ({
  draftRows,
  rowDiffs,
  removedDiffs,
  emptyMessage,
  onUpdate,
  onSetStatus,
  onRemove,
  onUndoRemove,
  onAdd
}: {
  readonly draftRows: readonly RosterDraftRow[];
  readonly rowDiffs: readonly RosterRowDiff[];
  readonly removedDiffs: readonly RosterRowDiff[];
  readonly emptyMessage: string;
  readonly onUpdate: (key: string, field: "studentId" | "githubUsername", value: string) => void;
  readonly onSetStatus: (key: string, status: "active" | "hold" | "dropped") => void;
  readonly onRemove: (key: string) => void;
  readonly onUndoRemove: (diff: RosterRowDiff) => void;
  readonly onAdd: () => void;
}): ReactElement => (
  <section className="roster-students-panel" aria-labelledby="roster-students-title">
    <div className="roster-panel-heading">
      <div>
        <h2 id="roster-students-title">Students</h2>
        <p>Edits remain local until you review and save.</p>
      </div>
      <button className="secondary-action" onClick={onAdd} type="button">
        Add student
      </button>
    </div>
    {draftRows.length === 0 ? (
      <div className="roster-empty-state">
        <p>{emptyMessage}</p>
        <button className="secondary-action" onClick={onAdd} type="button">
          Add student
        </button>
      </div>
    ) : (
      <div className="data-table__scroll roster-student-table__scroll">
        <table className="data-table roster-student-table">
          <thead>
            <tr>
              <th className="data-table__header">Student ID</th>
              <th className="data-table__header">GitHub</th>
              <th className="data-table__header">Status</th>
              <th className="data-table__header data-table__header--end">
                <span className="sr-only">Student actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {draftRows.map((draftRow, index) => {
              const diff = getCurrentDiff(draftRow.row, rowDiffs);
              const diffClass =
                diff?.changeType === "added"
                  ? " roster-student-table__row--added"
                  : diff?.changeType === "changed"
                    ? " roster-student-table__row--changed"
                    : "";
              const identity = draftRow.row.studentId.trim() || `row ${String(index + 1)}`;
              return (
                <tr className={`roster-student-table__row${diffClass}`} key={draftRow.key}>
                  <td className="data-table__cell">
                    <label className="sr-only" htmlFor={`student-id-${draftRow.key}`}>
                      Student ID for {identity}
                    </label>
                    <input
                      id={`student-id-${draftRow.key}`}
                      onChange={(event) => onUpdate(draftRow.key, "studentId", event.target.value)}
                      placeholder="Student ID"
                      value={draftRow.row.studentId}
                    />
                    {diff === undefined ? null : (
                      <span className={`roster-row-change roster-row-change--${diff.changeType}`}>
                        {diff.changeType === "added" ? "Added" : "Changed"}
                      </span>
                    )}
                  </td>
                  <td className="data-table__cell">
                    <label className="sr-only" htmlFor={`github-${draftRow.key}`}>
                      GitHub username for {identity}
                    </label>
                    <input
                      aria-invalid={draftRow.row.githubUsername.trim().length === 0}
                      className={
                        draftRow.row.githubUsername.trim().length === 0
                          ? "roster-student-table__input--attention"
                          : undefined
                      }
                      id={`github-${draftRow.key}`}
                      onChange={(event) =>
                        onUpdate(draftRow.key, "githubUsername", event.target.value)
                      }
                      placeholder="Not set"
                      value={draftRow.row.githubUsername}
                    />
                  </td>
                  <td className="data-table__cell">
                    <StatusChip
                      label={getRosterStatusLabel(draftRow.row.status)}
                      variant={getStatusVariant(draftRow.row.status)}
                    />
                  </td>
                  <td className="data-table__cell data-table__cell--end">
                    <OverflowMenu
                      aria-label={`Actions for student ${identity}`}
                      groups={[
                        {
                          id: "status",
                          heading: "Status",
                          items: [
                            {
                              id: "active",
                              label: "Mark active",
                              disabled: draftRow.row.status === "active",
                              onSelect: () => onSetStatus(draftRow.key, "active")
                            },
                            {
                              id: "hold",
                              label: "Put on hold",
                              disabled: draftRow.row.status === "hold",
                              onSelect: () => onSetStatus(draftRow.key, "hold")
                            },
                            {
                              id: "dropped",
                              label: "Mark dropped",
                              disabled: draftRow.row.status === "dropped",
                              onSelect: () => onSetStatus(draftRow.key, "dropped")
                            }
                          ]
                        },
                        {
                          id: "remove",
                          items: [
                            {
                              id: "remove-row",
                              label: "Remove student row",
                              destructive: true,
                              onSelect: () => onRemove(draftRow.key)
                            }
                          ]
                        }
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
    {removedDiffs.length === 0 ? null : (
      <div className="roster-removed-rows" aria-label="Removed before save">
        <h3>Removed before save</h3>
        <ul>
          {removedDiffs.map((diff) => (
            <li key={diff.studentId}>
              <div>
                <span className="roster-row-change roster-row-change--dropped">Removed</span>
                <strong>{diff.studentId}</strong>
                <span>{diff.baseline?.githubUsername || "GitHub not set"}</span>
                <StatusChip
                  label={getRosterStatusLabel(diff.baseline?.status ?? "")}
                  variant={getStatusVariant(diff.baseline?.status ?? "")}
                />
              </div>
              <button className="secondary-action" onClick={() => onUndoRemove(diff)} type="button">
                Undo removal
              </button>
            </li>
          ))}
        </ul>
      </div>
    )}
  </section>
);
