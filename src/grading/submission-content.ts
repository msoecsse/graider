import { loadGraiderConfig } from "../config/config-loader.js";
import type { GradingStatePathRequest } from "./grading-state.js";
import {
  DEFAULT_GRAIDER_GENERATED_GRADING_REPORT_PATH,
  PUBLISHED_STUDENT_REPORT_PATH,
  PUBLISHED_STUDENT_RESULTS_PATH,
  resolveGraiderGeneratedStudentReportDestination
} from "../reporting/student-report-publisher.js";
import { GRAIDER_MANAGED_WORKFLOW_PATH } from "../workflows/managed-workflow-policy.js";

export interface SubmissionTreeReader {
  listTree(revision: string): Promise<
    readonly {
      readonly path: string;
      readonly objectId: string;
      readonly mode: string;
    }[]
  >;
}

export const generatedSubmissionPaths = (request: GradingStatePathRequest): ReadonlySet<string> => {
  const generatedPaths = new Set<string>([
    DEFAULT_GRAIDER_GENERATED_GRADING_REPORT_PATH,
    PUBLISHED_STUDENT_REPORT_PATH,
    PUBLISHED_STUDENT_RESULTS_PATH,
    GRAIDER_MANAGED_WORKFLOW_PATH
  ]);
  const config = loadGraiderConfig({
    cwd: request.courseRoot,
    assignmentFile: `terms/${request.termCode}/assignments/${request.assignmentSlug}/assignment.yml`
  });
  if (config.status === "success") {
    const destination = resolveGraiderGeneratedStudentReportDestination(
      config.config.course.reports.student_publish
    );
    if (destination.status === "success") generatedPaths.add(destination.path);
  }
  return generatedPaths;
};

// Use committed blob identities and modes, including binary files. Unknown paths
// count as work; commit authors/messages cannot establish submission ownership.
export const readStudentSubmissionTree = async (
  workspace: SubmissionTreeReader,
  sha: string,
  generatedPaths: ReadonlySet<string>
): Promise<ReadonlyMap<string, string>> =>
  new Map(
    (await workspace.listTree(sha))
      .filter((entry) => !entry.path.startsWith(".graider/") && !generatedPaths.has(entry.path))
      .map((entry) => [entry.path, `${entry.mode}:${entry.objectId}`])
  );

export const submissionTreesDiffer = (
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>
): boolean =>
  before.size !== after.size || [...before].some(([file, entry]) => after.get(file) !== entry);
