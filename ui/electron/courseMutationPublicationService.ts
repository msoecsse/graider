import type {
  CourseMutationPublicationResult,
  CoursePublishActionResult,
  CourseSetupDiagnostic
} from "./ipc.js";
import { publishCourseChanges } from "./coursePublishService.js";

type CourseMutationResult = {
  readonly status: string;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
};

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });

const publicationResult = (result: CoursePublishActionResult): CourseMutationPublicationResult => ({
  status: result.status === "failure" ? "failure" : "success",
  diagnostics: result.diagnostics
});

const failedPublication = (error: unknown): CourseMutationPublicationResult => ({
  status: "failure",
  diagnostics: [
    diagnostic(
      `Unable to publish course changes: ${error instanceof Error ? error.message : "unknown error"}`
    )
  ]
});

export const publishSuccessfulCourseMutation = async <T extends CourseMutationResult>(
  courseFolderPath: string,
  result: T,
  publish: (path: string) => Promise<CoursePublishActionResult> = publishCourseChanges
): Promise<T & { readonly publication?: CourseMutationPublicationResult }> => {
  if (result.status !== "success") return result;
  const publication = await publish(courseFolderPath)
    .then(publicationResult)
    .catch(failedPublication);
  return publication.status === "success"
    ? { ...result, publication }
    : {
        ...result,
        publication,
        diagnostics: [
          ...result.diagnostics,
          ...publication.diagnostics,
          diagnostic(
            "Changes were saved locally, but could not be published to the course repository. Use Publish Course Changes to retry."
          )
        ]
      };
};
