import path from "node:path";
import { toForwardSlashPath } from "../core/paths.js";

const TERMS_DIRECTORY = "terms";
const REPORTS_DIRECTORY = "reports";
const FACULTY_JSON_FILE = "faculty-summary.json";
const FACULTY_CSV_FILE = "faculty-summary.csv";
const FACULTY_MARKDOWN_FILE = "faculty-summary.md";
const STUDENTS_DIRECTORY = "students";

export interface ReportPaths {
  reportDirectory: {
    absolutePath: string;
    relativePath: string;
  };
  facultyJson: {
    absolutePath: string;
    relativePath: string;
  };
  facultyCsv: {
    absolutePath: string;
    relativePath: string;
  };
  facultyMarkdown: {
    absolutePath: string;
    relativePath: string;
  };
}

const createRelativeReportDirectory = (termCode: string, assignmentSlug: string): string =>
  toForwardSlashPath(path.join(TERMS_DIRECTORY, termCode, REPORTS_DIRECTORY, assignmentSlug));

const createPathPair = (repoRoot: string, relativePath: string) => ({
  absolutePath: path.join(repoRoot, relativePath),
  relativePath: toForwardSlashPath(relativePath)
});

export const createReportPaths = (
  repoRoot: string,
  termCode: string,
  assignmentSlug: string
): ReportPaths => {
  const reportDirectory = createRelativeReportDirectory(termCode, assignmentSlug);

  return {
    reportDirectory: createPathPair(repoRoot, reportDirectory),
    facultyJson: createPathPair(repoRoot, path.join(reportDirectory, FACULTY_JSON_FILE)),
    facultyCsv: createPathPair(repoRoot, path.join(reportDirectory, FACULTY_CSV_FILE)),
    facultyMarkdown: createPathPair(repoRoot, path.join(reportDirectory, FACULTY_MARKDOWN_FILE))
  };
};

export const createStudentReportRelativePath = (
  termCode: string,
  assignmentSlug: string,
  section: string,
  studentId: string
): string =>
  toForwardSlashPath(
    path.join(
      createRelativeReportDirectory(termCode, assignmentSlug),
      STUDENTS_DIRECTORY,
      section,
      `${studentId}.md`
    )
  );
