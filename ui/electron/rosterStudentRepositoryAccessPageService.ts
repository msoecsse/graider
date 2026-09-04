import fs from "node:fs";
import path from "node:path";

import { parseDocument } from "yaml";

import { getAssignmentForEdit } from "./assignmentEditService.js";
import { getAssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import type { ProcessRunner } from "./commandRunner.js";
import type {
  CourseSetupDiagnostic,
  RosterRemoveRequest,
  RosterRemoveResult,
  RosterSaveRequest,
  RosterSaveResult,
  RosterSectionRequest,
  StudentRepositoryAccessPageRequest
} from "./ipc.js";
import { removeRoster, removeSection, saveRoster } from "./rosterManagerService.js";
import { generateStudentRepositoryAccessPage } from "./studentRepositoryAccessPageService.js";
import { publishStudentRepositoryAccessPage } from "./studentRepositoryAccessPagePublishService.js";

interface RosterAccessPageOptions {
  readonly runner: ProcessRunner;
  readonly pagesRepositoryFolderPath: string | null;
}

type RosterMutationResult = RosterSaveResult | RosterRemoveResult;

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });

const hasStudentRepositoryPageConfiguration = (courseFolderPath: string): boolean => {
  try {
    const course = parseDocument(
      fs.readFileSync(path.join(courseFolderPath, "course.yml"), "utf8")
    ).toJS() as { notifications?: { student_access_pages?: unknown } };
    const settings = course.notifications?.student_access_pages;
    return (
      typeof settings === "object" &&
      settings !== null &&
      ["repository", "base_url", "branch"].every(
        (key) =>
          typeof (settings as Record<string, unknown>)[key] === "string" &&
          (settings as Record<string, string>)[key].trim() !== ""
      )
    );
  } catch {
    return false;
  }
};

const getAffectedAssignmentFiles = (request: RosterSectionRequest): readonly string[] => {
  const assignmentsPath = path.join(
    request.courseFolderPath,
    "terms",
    request.termCode,
    "assignments"
  );
  try {
    return fs.readdirSync(assignmentsPath, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) return [];
      const assignmentFile = `terms/${request.termCode}/assignments/${entry.name}/assignment.yml`;
      const assignment = getAssignmentForEdit(request.courseFolderPath, assignmentFile);
      return assignment.model?.sectionIds.includes(request.sectionId) ? [assignmentFile] : [];
    });
  } catch {
    return [];
  }
};

const refreshStudentRepositoryPages = async (
  request: RosterSectionRequest,
  options: RosterAccessPageOptions
): Promise<readonly CourseSetupDiagnostic[]> => {
  if (!hasStudentRepositoryPageConfiguration(request.courseFolderPath)) return [];

  const diagnostics: CourseSetupDiagnostic[] = [];
  for (const assignmentFile of getAffectedAssignmentFiles(request)) {
    const accessRequest: StudentRepositoryAccessPageRequest = {
      ...request,
      assignmentFile,
      pagesRepositoryFolderPath: options.pagesRepositoryFolderPath
    };
    const mappings = await getAssignmentRepositoryMappings({
      ...accessRequest,
      runner: options.runner
    });
    const generated = await generateStudentRepositoryAccessPage(accessRequest, mappings);
    if (generated.status === "failure") {
      diagnostics.push(
        ...generated.diagnostics.map((item) =>
          diagnostic(
            `${assignmentFile}: unable to regenerate the Student Repository page: ${item.message}`
          )
        )
      );
      continue;
    }
    const published = await publishStudentRepositoryAccessPage(accessRequest, mappings);
    if (published.status === "failure") {
      diagnostics.push(
        ...published.diagnostics.map((item) =>
          diagnostic(
            `${assignmentFile}: unable to publish the Student Repository page: ${item.message}`
          )
        )
      );
    }
  }
  return diagnostics;
};

const withStudentRepositoryPageRefresh = async <T extends RosterMutationResult>(
  request: RosterSectionRequest,
  result: T,
  options: RosterAccessPageOptions
): Promise<T> => {
  if (result.status === "failure") return result;
  const diagnostics = await refreshStudentRepositoryPages(request, options);
  return diagnostics.length === 0
    ? result
    : {
        ...result,
        status: "failure",
        diagnostics: [
          ...result.diagnostics,
          diagnostic(
            `Roster changes were saved, but Student Repository page publication needs attention. ${diagnostics.map((item) => item.message).join(" ")}`
          )
        ]
      };
};

export const saveRosterWithStudentRepositoryAccessPageRefresh = async (
  request: RosterSaveRequest,
  options: RosterAccessPageOptions
): Promise<RosterSaveResult> =>
  withStudentRepositoryPageRefresh(request, saveRoster(request), options);

export const removeRosterWithStudentRepositoryAccessPageRefresh = async (
  request: RosterRemoveRequest,
  options: RosterAccessPageOptions
): Promise<RosterRemoveResult> =>
  withStudentRepositoryPageRefresh(request, removeRoster(request), options);

export const removeSectionWithStudentRepositoryAccessPageRefresh = async (
  request: RosterRemoveRequest,
  options: RosterAccessPageOptions
): Promise<RosterRemoveResult> =>
  withStudentRepositoryPageRefresh(request, removeSection(request), options);
