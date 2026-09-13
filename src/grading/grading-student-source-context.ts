import { loadGraiderConfig } from "../config/config-loader.js";
import { buildSubmissionSourceModel } from "./submission-source.js";
import { resolveGradingSubmissionContext } from "./grading-submission-context.js";

export const loadGradingStudentSourceContext = (request: {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly repositoryRoot: string;
  readonly currentSubmissionCommitSha: string;
}) => {
  const submission = resolveGradingSubmissionContext(request);
  if (submission.status !== "success") return submission;
  const config = loadGraiderConfig({
    cwd: request.courseFolderPath,
    assignmentFile: `terms/${request.termCode}/assignments/${request.assignmentSlug}/assignment.yml`
  });
  if (config.status === "failure") return { status: "assignment_config_error" } as const;
  const source = buildSubmissionSourceModel({
    repositoryRoot: request.repositoryRoot,
    requiredFiles: config.config.assignment.grading?.required_files ?? []
  });
  return source.status === "failure"
    ? ({ status: "source_error", code: source.code } as const)
    : ({ status: "success", studentId: request.studentId, ...source.value } as const);
};
