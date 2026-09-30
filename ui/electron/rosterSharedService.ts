import fs from "node:fs";
import path from "node:path";

interface RosterDiagnostic {
  readonly code: string;
  readonly message: string;
}

interface RosterRecord {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
  readonly status: string;
}

interface RosterStudent extends RosterRecord {
  readonly rosterPath: string;
  readonly rowNumber: number;
}

interface RosterSharedBackend {
  parseRosterCsvText(content: string): { readonly headers: readonly string[] };
  parseAndValidateRosterCsv(request: {
    readonly content: string;
    readonly rosterPath: string;
    readonly expectedSection: string;
  }): {
    readonly records: readonly RosterRecord[];
    readonly recordRowNumbers: readonly number[];
    readonly duplicateValidationRecords: readonly RosterRecord[];
    readonly duplicateValidationRowNumbers: readonly number[];
    readonly warnings: readonly RosterDiagnostic[];
    readonly errors: readonly RosterDiagnostic[];
  };
  validateRosterDuplicates(students: readonly RosterStudent[]): readonly RosterDiagnostic[];
}

const getBackendPath = (): string => {
  const packagedPath = path.join(__dirname, "rosterSharedBackend.cjs");
  return fs.existsSync(packagedPath)
    ? packagedPath
    : path.resolve(__dirname, "../dist-electron/rosterSharedBackend.cjs");
};

const loadBackend = (): RosterSharedBackend => require(getBackendPath()) as RosterSharedBackend;

export const parseRosterCsvText = (content: string): { readonly headers: readonly string[] } =>
  loadBackend().parseRosterCsvText(content);

export const parseAndValidateRosterCsv = (request: {
  readonly content: string;
  readonly rosterPath: string;
  readonly expectedSection: string;
}): ReturnType<RosterSharedBackend["parseAndValidateRosterCsv"]> =>
  loadBackend().parseAndValidateRosterCsv(request);

export const validateRosterDuplicates = (
  students: readonly RosterStudent[]
): readonly RosterDiagnostic[] => loadBackend().validateRosterDuplicates(students);
