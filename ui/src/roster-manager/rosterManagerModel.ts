import type { RosterRow, RosterSourceKind } from "../../electron/ipc";
import type { RosterDiffResult, RosterRowDiff } from "../../../src/roster/roster-shared";

export interface RosterDraftRow {
  readonly key: string;
  readonly row: RosterRow;
}

export interface FacultyDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: boolean;
}

const normalizeFacultyIdentity = (username: string): string => username.trim().toLowerCase();

const indexFaculty = (faculty: readonly string[]): Map<string, string> =>
  new Map(
    faculty
      .map((username) => username.trim())
      .filter((username) => username.length > 0)
      .map((username) => [normalizeFacultyIdentity(username), username])
  );

export const diffFaculty = (
  baseline: readonly string[],
  current: readonly string[]
): FacultyDiff => {
  const baselineByIdentity = indexFaculty(baseline);
  const currentByIdentity = indexFaculty(current);
  const added = [...currentByIdentity.entries()]
    .filter(([identity]) => !baselineByIdentity.has(identity))
    .map(([, username]) => username);
  const removed = [...baselineByIdentity.entries()]
    .filter(([identity]) => !currentByIdentity.has(identity))
    .map(([, username]) => username);

  return { added, removed, changed: added.length > 0 || removed.length > 0 };
};

export const getRosterStatusLabel = (status: string): string => {
  if (status === "active") return "Active";
  if (status === "hold") return "On hold";
  if (status === "dropped") return "Dropped";
  return "Unavailable";
};

export const getSourceKindLabel = (kind: RosterSourceKind): string =>
  kind === "csv_upload" ? "CSV upload" : "Manual edit";

export const getDiffTypeLabel = (diff: RosterRowDiff): string =>
  diff.changeType === "dropped" ? "Removed" : diff.changeType === "added" ? "Added" : "Changed";

export const getUnsavedMessage = (
  diff: RosterDiffResult,
  facultyChanged: boolean,
  isCreatingSection: boolean
): string => {
  if (isCreatingSection) return "New section has unsaved changes";
  if (diff.totalChangeCount === 0) return "Faculty assignment has unsaved changes";

  const studentLabel = `${String(diff.totalChangeCount)} student change${diff.totalChangeCount === 1 ? "" : "s"}`;
  const counts = `${String(diff.addedCount)} added, ${String(diff.droppedCount)} removed, ${String(diff.changedCount)} changed`;
  return `${studentLabel} — ${counts}${facultyChanged ? " · faculty updated" : ""}`;
};

export const getRowDiffDetail = (diff: RosterRowDiff): string => {
  const record = diff.current ?? diff.baseline;
  if (record === null) return "";
  if (diff.changeType !== "changed" || diff.baseline === null || diff.current === null) {
    return `GitHub: ${record.githubUsername || "Not set"} · Status: ${getRosterStatusLabel(record.status)}`;
  }

  return diff.changedFields
    .map((field) => {
      if (field === "githubUsername") {
        return `GitHub: ${diff.baseline?.githubUsername || "Not set"} → ${diff.current?.githubUsername || "Not set"}`;
      }
      if (field === "status") {
        return `Status: ${getRosterStatusLabel(diff.baseline?.status ?? "")} → ${getRosterStatusLabel(diff.current?.status ?? "")}`;
      }
      return `Section: ${diff.baseline?.section ?? ""} → ${diff.current?.section ?? ""}`;
    })
    .join(" · ");
};
