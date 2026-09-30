import fs from "node:fs";
import path from "node:path";
import { validateTermConfig } from "../config/config-validation.js";
import { loadTermConfig } from "../config/load-term-config.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { createRosterSummary } from "./roster-models.js";
import { parseAndValidateRosterCsv } from "./roster-shared.js";
import { isRosterStatus } from "./roster-validation.js";

const TERMS_DIRECTORY = "terms";
const TERM_CONFIG_FILE_NAME = "term.yml";

export interface RosterSectionSummariesContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
}

export interface RosterSectionSummaryDiagnostic {
  readonly code: string;
  readonly message: string;
}

interface RosterSectionSummaryBase {
  readonly sectionId: string;
  readonly diagnostics: readonly RosterSectionSummaryDiagnostic[];
}

export type RosterSectionSummary =
  | (RosterSectionSummaryBase & {
      readonly status: "ready";
      readonly exists: true;
      readonly studentCount: number;
      readonly activeStudentCount: number;
      readonly droppedStudentCount: number;
      readonly holdStudentCount: number;
    })
  | (RosterSectionSummaryBase & {
      readonly status: "missing";
      readonly exists: false;
    })
  | (RosterSectionSummaryBase & {
      readonly status: "invalid";
      readonly exists: true;
    });

export type RosterSectionSummariesContextResult =
  | {
      readonly status: "ready";
      readonly summaries: readonly RosterSectionSummary[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "term_config_error";
      readonly summaries: readonly [];
      readonly diagnostics: readonly RosterSectionSummaryDiagnostic[];
    };

const toDiagnostics = (diagnostics: readonly Diagnostic[]): RosterSectionSummaryDiagnostic[] =>
  diagnostics.map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message }));

const isContainedPath = (root: string, filePath: string): boolean => {
  const relativePath = path.relative(root, filePath);
  return (
    relativePath.length > 0 && !relativePath.startsWith(`..${path.sep}`) && relativePath !== ".."
  );
};

const getRosterPath = (termCode: string, roster: string): string =>
  path.posix.join(TERMS_DIRECTORY, termCode, roster);

const toSummaryStudents = (records: readonly { readonly status: string }[]) =>
  records.flatMap((record) => (isRosterStatus(record.status) ? [{ status: record.status }] : []));

const loadSectionSummary = (
  courseFolderPath: string,
  termCode: string,
  section: { readonly id: string; readonly roster?: string | undefined }
): RosterSectionSummary => {
  if (section.roster === undefined) {
    return { sectionId: section.id, status: "missing", exists: false, diagnostics: [] };
  }

  const rosterPath = getRosterPath(termCode, section.roster);
  const root = path.resolve(courseFolderPath);
  const absolutePath = path.resolve(root, rosterPath);
  if (!isContainedPath(root, absolutePath)) {
    return {
      sectionId: section.id,
      status: "invalid",
      exists: true,
      diagnostics: [
        { code: "roster_path_outside_course", message: "Roster path is outside the course folder." }
      ]
    };
  }
  if (!fs.existsSync(absolutePath)) {
    return { sectionId: section.id, status: "missing", exists: false, diagnostics: [] };
  }

  try {
    const parsed = parseAndValidateRosterCsv({
      content: fs.readFileSync(absolutePath, "utf8"),
      rosterPath,
      expectedSection: section.id
    });
    if (parsed.errors.length > 0) {
      return {
        sectionId: section.id,
        status: "invalid",
        exists: true,
        diagnostics: toDiagnostics(parsed.errors)
      };
    }
    const summary = createRosterSummary([rosterPath], toSummaryStudents(parsed.records));
    return {
      sectionId: section.id,
      status: "ready",
      exists: true,
      studentCount: summary.studentCount,
      activeStudentCount: summary.activeStudentCount,
      droppedStudentCount: summary.droppedStudentCount,
      holdStudentCount: summary.holdStudentCount,
      diagnostics: toDiagnostics(parsed.warnings)
    };
  } catch {
    return {
      sectionId: section.id,
      status: "invalid",
      exists: true,
      diagnostics: [{ code: "roster_read_failed", message: "Unable to read roster CSV." }]
    };
  }
};

export const resolveRosterSectionSummariesContext = (
  request: RosterSectionSummariesContextRequest
): RosterSectionSummariesContextResult => {
  const termConfigPath = path.posix.join(TERMS_DIRECTORY, request.termCode, TERM_CONFIG_FILE_NAME);
  const termResult = loadTermConfig(path.join(request.courseFolderPath, termConfigPath));
  if (termResult.status === "failure") {
    return {
      status: "term_config_error",
      summaries: [],
      diagnostics: toDiagnostics(termResult.diagnostics)
    };
  }
  const termDiagnostics = validateTermConfig(termConfigPath, termResult.value, request.termCode);
  if (termDiagnostics.length > 0) {
    return {
      status: "term_config_error",
      summaries: [],
      diagnostics: toDiagnostics(termDiagnostics)
    };
  }
  return {
    status: "ready",
    summaries: termResult.value.sections.map((section) =>
      loadSectionSummary(request.courseFolderPath, request.termCode, section)
    ),
    diagnostics: []
  };
};
