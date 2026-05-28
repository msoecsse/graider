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
