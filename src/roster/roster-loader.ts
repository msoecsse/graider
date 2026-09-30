import path from "node:path";
import type { LoadedGraiderConfig, RawTermConfig } from "../config/config-models.js";
import { toForwardSlashPath } from "../core/paths.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { readTextFile } from "../io/file-system.js";
import {
  createRosterSummary,
  type RosterLoadResult,
  type RosterSectionSource,
  type RosterStudent,
  type RosterSummary
} from "./roster-models.js";
import { parseAndValidateRosterCsv } from "./roster-shared.js";
import { validateRosterDuplicates } from "./roster-validation.js";

const EMPTY_COUNT = 0;
const TERM_DIRECTORY_DEPTH = 2;
const createEmptySummary = (rosterFiles: string[]): RosterSummary => ({
  rosterFiles,
  studentCount: EMPTY_COUNT,
  activeStudentCount: EMPTY_COUNT,
  droppedStudentCount: EMPTY_COUNT,
  holdStudentCount: EMPTY_COUNT
});

const getTermDirectory = (termConfigPath: string): string =>
  termConfigPath.split("/").slice(EMPTY_COUNT, TERM_DIRECTORY_DEPTH).join("/");

const getSectionSources = (
  termConfigPath: string,
  sections: readonly RawTermConfig["sections"][number][],
  sectionIds: readonly string[]
): RosterSectionSource[] => {
  const termDirectory = getTermDirectory(termConfigPath);
  const sectionsById = new Map(
    sections.flatMap((section) =>
      section.roster === undefined
        ? []
        : [[section.id, toForwardSlashPath(path.posix.join(termDirectory, section.roster))]]
    )
  );

  return sectionIds.flatMap((sectionId) => {
    const rosterPath = sectionsById.get(sectionId);
    return rosterPath === undefined ? [] : [{ sectionId, rosterPath }];
  });
};

const loadSectionRoster = (
  repoRoot: string,
  source: RosterSectionSource
): {
  students: RosterStudent[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
} => {
  const fileResult = readTextFile(path.join(repoRoot, source.rosterPath));

  if (fileResult.status === "failure") {
    return {
      students: [],
      warnings: [],
      errors: [fileResult.diagnostic]
    };
  }

  const parsed = parseAndValidateRosterCsv({
    content: fileResult.content,
    rosterPath: source.rosterPath,
    expectedSection: source.sectionId
  });
  const students: RosterStudent[] = parsed.records.map((record, index) => ({
    studentId: record.studentId,
    githubUsername: record.githubUsername,
    section: record.section,
    status: record.status as RosterStudent["status"],
    rosterPath: source.rosterPath,
    rowNumber: parsed.recordRowNumbers[index] ?? EMPTY_COUNT
  }));

  return {
    students,
    warnings: [...parsed.warnings],
    errors: [...parsed.errors]
  };
};

export interface TermRosterLoadRequest {
  readonly repoRoot: string;
  readonly termConfigPath: string;
  readonly sections: readonly RawTermConfig["sections"][number][];
  readonly sectionIds: readonly string[];
}

export const loadTermRosters = (request: TermRosterLoadRequest): RosterLoadResult => {
  const sources = getSectionSources(request.termConfigPath, request.sections, request.sectionIds);
  const rosterFiles = sources.map((source) => source.rosterPath);
  const loadedSections = sources.map((source) => loadSectionRoster(request.repoRoot, source));
  const students = loadedSections.flatMap((section) => section.students);
  const warnings = loadedSections.flatMap((section) => section.warnings);
  const errors = [
    ...loadedSections.flatMap((section) => section.errors),
    ...validateRosterDuplicates(students)
  ];

  return {
    students,
    warnings,
    errors,
    summary:
      errors.length > EMPTY_COUNT
        ? createEmptySummary(rosterFiles)
        : createRosterSummary(rosterFiles, students)
  };
};

export const loadAssignmentRosters = (config: LoadedGraiderConfig): RosterLoadResult =>
  loadTermRosters({
    repoRoot: config.summary.repoRoot,
    termConfigPath: config.summary.termConfigPath,
    sections: config.term.sections,
    sectionIds: config.assignment.sections
  });
