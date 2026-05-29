import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { RosterStudent } from "../roster/roster-models.js";
import { ROSTER_STATUS_ACTIVE } from "../roster/roster-models.js";

const EMPTY_COUNT = 0;
const SINGLE_SELECTOR_COUNT = 1;

export type TargetSelector =
  | { kind: "all" }
  | { kind: "section"; section: string }
  | { kind: "student_id"; studentId: string }
  | { kind: "github_username"; githubUsername: string };

export interface RawTargetSelector {
  all?: boolean;
  section?: string;
  studentId?: string;
  githubUsername?: string;
}

export interface TargetSelectorValidationResult {
  selector?: TargetSelector;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export interface TargetSelectionResult {
  students: RosterStudent[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
  summary: {
    targetsSelected: number;
    targetSelector: string;
  };
}

const normalizeIdentity = (value: string): string => value.trim().toLowerCase();

const createSelectorDiagnostic = (
  code: string,
  message: string,
  context?: Record<string, unknown>
): Diagnostic => createConfigDiagnostic(code, message, context);

const describeSelector = (selector: TargetSelector): string => {
  if (selector.kind === "all") {
    return "all";
  }

  if (selector.kind === "section") {
    return `section:${selector.section}`;
  }

  if (selector.kind === "student_id") {
    return `student_id:${selector.studentId}`;
  }

  return `github_username:${selector.githubUsername}`;
};

export const validateTargetSelector = (
  rawSelector: RawTargetSelector
): TargetSelectorValidationResult => {
  const selectors: TargetSelector[] = [];

  if (rawSelector.all === true) {
    selectors.push({ kind: "all" });
  }

  if (rawSelector.section !== undefined) {
    selectors.push({ kind: "section", section: rawSelector.section.trim() });
  }

  if (rawSelector.studentId !== undefined) {
    selectors.push({ kind: "student_id", studentId: normalizeIdentity(rawSelector.studentId) });
  }

  if (rawSelector.githubUsername !== undefined) {
    selectors.push({
      kind: "github_username",
      githubUsername: normalizeIdentity(rawSelector.githubUsername)
    });
  }

  if (selectors.length === EMPTY_COUNT) {
    return {
      warnings: [],
      errors: [
        createSelectorDiagnostic(
          DiagnosticCode.TargetSelectorMissing,
          "Grade requires exactly one target selector."
        )
      ]
    };
  }

  if (selectors.length > SINGLE_SELECTOR_COUNT) {
    return {
      warnings: [],
      errors: [
        createSelectorDiagnostic(
          DiagnosticCode.TargetSelectorAmbiguous,
          "Grade received more than one target selector."
        )
      ]
    };
  }

  const selector = selectors[EMPTY_COUNT];

  return selector === undefined
    ? {
        warnings: [],
        errors: [
          createSelectorDiagnostic(
            DiagnosticCode.TargetSelectorMissing,
            "Grade requires exactly one target selector."
          )
        ]
      }
    : {
        selector,
        warnings: [],
        errors: []
      };
};

const createNoMatchesDiagnostic = (selector: TargetSelector): Diagnostic =>
  createSelectorDiagnostic(
    DiagnosticCode.TargetMatchesNoStudents,
    "Target selector matched no active students.",
    { targetSelector: describeSelector(selector) }
  );

const createInactiveDiagnostic = (selector: TargetSelector, student: RosterStudent): Diagnostic =>
  createSelectorDiagnostic(
    DiagnosticCode.TargetStudentNotActive,
    "Target selector matched a student who is not active.",
    {
      targetSelector: describeSelector(selector),
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      status: student.status
    }
  );

const matchesSelector = (student: RosterStudent, selector: TargetSelector): boolean => {
  if (selector.kind === "all") {
    return true;
  }

  if (selector.kind === "section") {
    return student.section === selector.section;
  }

  if (selector.kind === "student_id") {
    return student.studentId === selector.studentId;
  }

  return normalizeIdentity(student.githubUsername) === normalizeIdentity(selector.githubUsername);
};

export const selectTargetStudents = (
  students: readonly RosterStudent[],
  selector: TargetSelector
): TargetSelectionResult => {
  const matchingStudents = students.filter((student) => matchesSelector(student, selector));
  const activeStudents = matchingStudents.filter(
    (student) => student.status === ROSTER_STATUS_ACTIVE
  );

  if (activeStudents.length > EMPTY_COUNT) {
    return {
      students: activeStudents,
      warnings: [],
      errors: [],
      summary: {
        targetsSelected: activeStudents.length,
        targetSelector: describeSelector(selector)
      }
    };
  }

  const directInactiveMatch =
    (selector.kind === "student_id" || selector.kind === "github_username") &&
    matchingStudents.length > EMPTY_COUNT
      ? matchingStudents[EMPTY_COUNT]
      : undefined;

  return {
    students: [],
    warnings: [],
    errors:
      directInactiveMatch === undefined
        ? [createNoMatchesDiagnostic(selector)]
        : [createInactiveDiagnostic(selector, directInactiveMatch)],
    summary: {
      targetsSelected: EMPTY_COUNT,
      targetSelector: describeSelector(selector)
    }
  };
};
