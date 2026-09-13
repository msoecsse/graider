import path from "node:path";
import { validateTermConfig } from "../config/config-validation.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { loadTermConfig } from "../config/load-term-config.js";
import { loadTermRosters } from "../roster/roster-loader.js";
import {
  resolveFacultyScope,
  type FacultyScopeResult,
  type FacultyScopeSection
} from "./faculty-scope-resolver.js";

const TERMS_DIRECTORY = "terms";
const TERM_CONFIG_FILE_NAME = "term.yml";

export interface FacultyScopeContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly currentFacultyMsoeUsername: string | null;
}

export type FacultyScopeContextResult =
  | FacultyScopeResult
  | {
      readonly status: "term_config_error";
      readonly sections: readonly string[];
      readonly students: readonly [];
      readonly errors: readonly Diagnostic[];
    };

export const resolveFacultyScopeContext = (
  request: FacultyScopeContextRequest
): FacultyScopeContextResult => {
  const termConfigPath = path.posix.join(TERMS_DIRECTORY, request.termCode, TERM_CONFIG_FILE_NAME);
  const termResult = loadTermConfig(path.join(request.courseFolderPath, termConfigPath));

  if (termResult.status === "failure") {
    return {
      status: "term_config_error",
      sections: [],
      students: [],
      errors: termResult.diagnostics
    };
  }

  const termDiagnostics = validateTermConfig(termConfigPath, termResult.value, request.termCode);
  if (termDiagnostics.length > 0) {
    return {
      status: "term_config_error",
      sections: [],
      students: [],
      errors: termDiagnostics
    };
  }

  const roster = loadTermRosters({
    repoRoot: request.courseFolderPath,
    termConfigPath,
    sections: termResult.value.sections,
    sectionIds: termResult.value.sections.map((section) => section.id)
  });

  return resolveFacultyScope(
    request.currentFacultyMsoeUsername,
    toFacultyScopeSections(termResult.value.sections),
    roster
  );
};

const toFacultyScopeSections = (
  sections: readonly { readonly id: string; readonly faculty?: readonly string[] | undefined }[]
): readonly FacultyScopeSection[] =>
  sections.map((section) =>
    section.faculty === undefined
      ? { id: section.id }
      : { id: section.id, faculty: section.faculty }
  );
