import { resolveCurrentFacultyScope } from "./facultyScopeService.js";
import {
  getLocalRepositoryLocatorPath,
  resolveLocalStudentRepository
} from "./localRepositoryLocator.js";
import type { GradingStudentSourceRequest } from "./gradingStudentSourceService.js";
import { readRepositoryDocument } from "./repositoryDocuments.js";
import { DOCUMENT_TOO_LARGE } from "./repositoryDocumentPolicy.js";
import { isLoadGradingStudentSourceRequest } from "./gradingStudentViewStateRequestValidation.js";
import { isRepositoryDocumentPath } from "./repositoryDocumentPolicy.js";
import type { GradingStudentDocumentRequest, GradingStudentDocumentResult } from "./ipc.js";

export const isGradingStudentDocumentRequest = (
  value: unknown
): value is GradingStudentDocumentRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { file, ...identity } = value as Record<string, unknown>;
  return isLoadGradingStudentSourceRequest(identity) && isRepositoryDocumentPath(file);
};
export const loadGradingStudentDocument = async (
  request: GradingStudentSourceRequest & { readonly file: string }
): Promise<GradingStudentDocumentResult> => {
  const scope = resolveCurrentFacultyScope(request);
  if (
    scope.status !== "success" ||
    !scope.students.some((student) => student.studentId === request.studentId)
  )
    return { status: "failure", message: "This student's documents are unavailable." };
  const repository = resolveLocalStudentRepository(
    getLocalRepositoryLocatorPath(request.userDataPath),
    request
  );
  if (repository.status !== "success")
    return {
      status: "failure",
      message: "Download this student's repository before viewing documents."
    };
  try {
    return {
      status: "success",
      bytes: await readRepositoryDocument(repository.localPath, request.file)
    };
  } catch (error) {
    return {
      status: "failure",
      message:
        error instanceof Error && error.message === DOCUMENT_TOO_LARGE
          ? DOCUMENT_TOO_LARGE
          : "This document is unavailable, damaged, encrypted, or unsupported."
    };
  }
};
