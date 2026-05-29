import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { ReportAssignmentIdentity, StudentReportSummary } from "./report-models.js";

const NEWLINE = "\n";
const EMPTY_DISPLAY = "";

const diagnosticCodes = (diagnostics: readonly Diagnostic[]): string =>
  diagnostics.map((diagnostic) => diagnostic.code).join("; ");

const formatNullableNumber = (value: number | null | undefined): string =>
  value === undefined || value === null ? EMPTY_DISPLAY : String(value);

const renderRepositoryLine = (student: StudentReportSummary): string => {
  if (student.repositoryName === undefined) {
    return "- Repository: missing";
  }

  if (student.repositoryUrl === undefined) {
    return `- Repository: ${student.repositoryName}`;
  }

  return `- Repository: [${student.repositoryName}](${student.repositoryUrl})`;
};

const renderCheckRows = (student: StudentReportSummary): string[] =>
  student.grading.checks.length === 0
    ? ["No check details were reported."]
    : [
        "| Check | Status | Points | Message |",
        "| --- | --- | --- | --- |",
        ...student.grading.checks.map((check) => {
          const points =
            check.pointsEarned === undefined && check.pointsPossible === undefined
              ? EMPTY_DISPLAY
              : `${formatNullableNumber(check.pointsEarned)}/${formatNullableNumber(check.pointsPossible)}`;

          return `| ${check.name} | ${check.status} | ${points} | ${check.message ?? EMPTY_DISPLAY} |`;
        })
      ];

const renderDetails = (student: StudentReportSummary): string[] => {
  const details = student.grading.checks.flatMap((check) =>
    check.details === undefined || check.details.length === 0
      ? []
      : [`### ${check.name}`, ...check.details.map((detail) => `- ${detail}`), ""]
  );

  return details.length === 0 ? ["No additional details were reported."] : details;
};

const renderNotConfiguredMessage = (student: StudentReportSummary): string[] =>
  student.grading.resultStatus === "not_configured"
    ? ["", "Grading was not configured for this assignment."]
    : [];

export const createStudentReportPath = (student: StudentReportSummary): string =>
  `students/${student.section}/${student.studentId}.md`;

export const renderStudentMarkdownReport = (
  assignment: ReportAssignmentIdentity,
  student: StudentReportSummary
): string =>
  [
    `# ${assignment.assignmentTitle}`,
    "",
    `Student: ${student.studentId} (${student.githubUsername})`,
    `Section: ${student.section}`,
    "",
    "## Submission",
    "",
    renderRepositoryLine(student),
    `- Repository status: ${student.repositoryStatus}`,
    `- Roster status: ${student.rosterStatus}`,
    "",
    "## Grading Result",
    "",
    `- Workflow status: ${student.grading.workflowStatus}`,
    `- Result status: ${student.grading.resultStatus}`,
    `- Artifact status: ${student.grading.artifactStatus}`,
    `- Result file status: ${student.grading.resultFileStatus}`,
    ...(student.grading.score === undefined
      ? []
      : [
          `- Score: ${formatNullableNumber(student.grading.score)}/${formatNullableNumber(student.grading.maxScore)}`
        ]),
    ...renderNotConfiguredMessage(student),
    "",
    "## Checks",
    "",
    ...renderCheckRows(student),
    "",
    "## Details",
    "",
    ...renderDetails(student),
    "",
    "## Diagnostics",
    "",
    `Warnings: ${diagnosticCodes(student.warnings)}`,
    `Errors: ${diagnosticCodes(student.errors)}`,
    ""
  ].join(NEWLINE);
