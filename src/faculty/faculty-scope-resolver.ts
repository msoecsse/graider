import type { Diagnostic } from "../diagnostics/diagnostic.js";
import {
  ROSTER_STATUS_ACTIVE,
  type RosterLoadResult,
  type RosterStudent
} from "../roster/roster-models.js";

export interface FacultyScopeSection {
  readonly id: string;
  readonly faculty?: readonly string[];
}

export interface FacultyScopedStudent {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
}

export type FacultyScopeResult =
  | {
      readonly status: "faculty_identity_required";
      readonly sections: readonly string[];
      readonly students: readonly FacultyScopedStudent[];
      readonly errors: readonly Diagnostic[];
    }
  | {
      readonly status: "no_assigned_sections";
      readonly sections: readonly string[];
      readonly students: readonly FacultyScopedStudent[];
      readonly errors: readonly Diagnostic[];
    }
  | {
      readonly status: "roster_error";
      readonly sections: readonly string[];
      readonly students: readonly FacultyScopedStudent[];
      readonly errors: readonly Diagnostic[];
    }
  | {
      readonly status: "success";
      readonly sections: readonly string[];
      readonly students: readonly FacultyScopedStudent[];
      readonly errors: readonly Diagnostic[];
    };

const empty = (
  status: FacultyScopeResult["status"],
  errors: readonly Diagnostic[] = []
): FacultyScopeResult => ({ status, sections: [], students: [], errors });

export const resolveFacultyScope = (
  currentFacultyMsoeUsername: string | null,
  sections: readonly FacultyScopeSection[],
  roster: RosterLoadResult
): FacultyScopeResult => {
  if (currentFacultyMsoeUsername === null) return empty("faculty_identity_required");
  const accessibleSections = sections
    .filter((section) => section.faculty?.includes(currentFacultyMsoeUsername) ?? false)
    .map((section) => section.id);
  if (accessibleSections.length === 0) return empty("no_assigned_sections");
  if (roster.errors.length > 0)
    return { ...empty("roster_error", roster.errors), sections: accessibleSections };
  const students = new Map<string, FacultyScopedStudent>();
  for (const student of roster.students.filter(
    (candidate) =>
      candidate.status === ROSTER_STATUS_ACTIVE && accessibleSections.includes(candidate.section)
  )) {
    const existing = students.get(student.studentId);
    if (existing === undefined) students.set(student.studentId, toScopedStudent(student));
  }
  return {
    status: "success",
    sections: accessibleSections,
    students: [...students.values()],
    errors: []
  };
};

const toScopedStudent = (student: RosterStudent): FacultyScopedStudent => ({
  studentId: student.studentId,
  githubUsername: student.githubUsername,
  section: student.section
});
