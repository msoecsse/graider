import fs from "node:fs";
import path from "node:path";

import type {
  AssignmentDeleteRequest,
  AssignmentDeleteResult,
  CourseSetupDiagnostic
} from "./ipc.js";

const ASSIGNMENT_PATH_PATTERN =
  /^terms\/\d{2}s[123]\/assignments\/[A-Za-z0-9][A-Za-z0-9._-]*\/assignment\.yml$/;

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });

const isContainedPath = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== "..";
};

export const deleteAssignment = (request: AssignmentDeleteRequest): AssignmentDeleteResult => {
  if (!request.confirmed)
    return {
      status: "failure",
      path: request.assignmentFile,
      diagnostics: [diagnostic("Assignment deletion must be confirmed before deleting files.")]
    };

  const root = path.resolve(request.courseFolderPath);
  const assignmentPath = path.resolve(root, request.assignmentFile);
  if (
    !ASSIGNMENT_PATH_PATTERN.test(request.assignmentFile.replaceAll("\\", "/")) ||
    !isContainedPath(root, assignmentPath)
  )
    return {
      status: "failure",
      path: request.assignmentFile,
      diagnostics: [diagnostic("Assignment path is invalid.")]
    };
  if (!fs.existsSync(assignmentPath))
    return {
      status: "failure",
      path: request.assignmentFile,
      diagnostics: [diagnostic("Assignment configuration file does not exist.")]
    };

  try {
    fs.unlinkSync(assignmentPath);
    try {
      fs.rmdirSync(path.dirname(assignmentPath));
    } catch {
      // Preserve assignment-local artifacts when the directory is not empty.
    }
    return { status: "success", path: request.assignmentFile, diagnostics: [] };
  } catch {
    return {
      status: "failure",
      path: request.assignmentFile,
      diagnostics: [diagnostic("Unable to delete assignment configuration file.")]
    };
  }
};
