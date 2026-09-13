import path from "node:path";
import { getLocalSettingsPath, loadLocalSettings } from "./localSettings.js";

interface FacultyScopeBackendRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly currentFacultyMsoeUsername: string | null;
}

interface FacultyScopeBackend {
  resolveFacultyScopeContext(request: FacultyScopeBackendRequest): FacultyScopeServiceResult;
}

export interface FacultyScopeServiceRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly userDataPath: string;
}

export type FacultyScopeServiceResult = {
  readonly status:
    | "faculty_identity_required"
    | "no_assigned_sections"
    | "roster_error"
    | "success"
    | "term_config_error";
  readonly sections: readonly string[];
  readonly students: readonly {
    readonly studentId: string;
    readonly githubUsername: string;
    readonly section: string;
  }[];
  readonly errors: readonly unknown[];
};

const loadBackend = (): FacultyScopeBackend =>
  require(path.join(__dirname, "facultyScopeBackend.cjs")) as FacultyScopeBackend;

export const createFacultyScopeService =
  (
    backend: FacultyScopeBackend = loadBackend()
  ): ((request: FacultyScopeServiceRequest) => FacultyScopeServiceResult) =>
  (request) => {
    const settings = loadLocalSettings(getLocalSettingsPath(request.userDataPath));

    return backend.resolveFacultyScopeContext({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      currentFacultyMsoeUsername: settings.currentFacultyMsoeUsername
    });
  };

export const resolveCurrentFacultyScope = (
  request: FacultyScopeServiceRequest
): FacultyScopeServiceResult => createFacultyScopeService()(request);
