import type { Diagnostic } from "../diagnostics/diagnostic.js";

export const ROSTER_STATUS_ACTIVE = "active";
export const ROSTER_STATUS_DROPPED = "dropped";
export const ROSTER_STATUS_HOLD = "hold";

export type RosterStatus =
  | typeof ROSTER_STATUS_ACTIVE
  | typeof ROSTER_STATUS_DROPPED
  | typeof ROSTER_STATUS_HOLD;

export interface RosterStudent {
  studentId: string;
  githubUsername: string;
  section: string;
  status: RosterStatus;
  rosterPath: string;
  rowNumber: number;
}

export interface RosterSummary {
  rosterFiles: string[];
  studentCount: number;
  activeStudentCount: number;
  droppedStudentCount: number;
  holdStudentCount: number;
}

// Keep all consumers of roster totals on the same status definitions. The
// Electron section-summary context uses this alongside the CLI roster loader.
export const createRosterSummary = (
  rosterFiles: readonly string[],
  students: readonly Pick<RosterStudent, "status">[]
): RosterSummary => ({
  rosterFiles: [...rosterFiles],
  studentCount: students.length,
  activeStudentCount: students.filter((student) => student.status === ROSTER_STATUS_ACTIVE).length,
  droppedStudentCount: students.filter((student) => student.status === ROSTER_STATUS_DROPPED)
    .length,
  holdStudentCount: students.filter((student) => student.status === ROSTER_STATUS_HOLD).length
});

export interface RosterLoadResult {
  students: RosterStudent[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
  summary: RosterSummary;
}

export interface RosterSectionSource {
  sectionId: string;
  rosterPath: string;
}
