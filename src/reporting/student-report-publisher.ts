import type { RawCourseConfig } from "../config/config-models.js";
import {
  createConfigDiagnostic,
  createWarningDiagnostic,
  DiagnosticCode
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import type { DownloadedArtifact } from "../github/github-models.js";
import type { ReportAssignmentIdentity, StudentReportSummary } from "./report-models.js";
import { renderStudentMarkdownReport } from "./student-markdown-renderer.js";
import { renderStudentResultsJson } from "./student-results-json-renderer.js";

export const PUBLISHED_STUDENT_REPORT_PATH = "grading/report.md";
/** The implicit destination for Slice 44 standalone HTML grading reports. */
export const DEFAULT_GRAIDER_GENERATED_GRADING_REPORT_PATH = "grading/report.html";
export const PUBLISHED_STUDENT_RESULTS_PATH = "grading/results.json";
export const PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE = "Publish Graider grading report [skip ci]";

const EMPTY_COUNT = 0;
const PUBLISHED_FILE_COUNT_PER_STUDENT = 2;
const FIRST_PUBLISHED_FILE_COUNT = 1;
const STUDENT_PUBLISH_MODE_GRAIDER_GENERATED = "graider-generated";
const STUDENT_PUBLISH_MODE_FACULTY_PROVIDED = "faculty-provided";
const STUDENT_PUBLISH_MODE_BOTH = "both";
const STUDENT_PUBLISH_MODE_DISABLED = "disabled";
const CURRENT_DIRECTORY_PREFIX = "./";
const WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g;

export type StudentPublishConfig = RawCourseConfig["reports"]["student_publish"];

export type GraiderGeneratedStudentReportDestinationResult =
  | { readonly status: "success"; readonly path: string }
  | { readonly status: "report_destination_unavailable" | "unsafe_report_destination" };

const isSafeRepositoryFilePath = (filePath: string): boolean => {
  const segments = filePath.split("/");
  return (
    filePath.trim() === filePath &&
    filePath.length > EMPTY_COUNT &&
    !filePath.startsWith("/") &&
    !filePath.includes("\\") &&
    !filePath.includes("\0") &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
};

export const resolveGraiderGeneratedStudentReportDestination = (
  studentPublishConfig: StudentPublishConfig
): GraiderGeneratedStudentReportDestinationResult => {
  const mode = getStudentPublishMode(studentPublishConfig);
  if (mode === STUDENT_PUBLISH_MODE_DISABLED || mode === STUDENT_PUBLISH_MODE_FACULTY_PROVIDED)
    return { status: "report_destination_unavailable" };
  const reportPath =
    mode === STUDENT_PUBLISH_MODE_BOTH
      ? (studentPublishConfig?.graider_report_destination ??
        DEFAULT_GRAIDER_GENERATED_GRADING_REPORT_PATH)
      : (studentPublishConfig?.destination_file ?? DEFAULT_GRAIDER_GENERATED_GRADING_REPORT_PATH);
  return isSafeRepositoryFilePath(reportPath)
    ? { status: "success", path: reportPath }
    : { status: "unsafe_report_destination" };
};

type GraiderReportFileGitHubClient = Pick<
  GitHubClient,
  "getRepositoryFileContent" | "writeRepositoryFile"
>;

export interface PublishGraiderOwnedStudentReportFileInput {
  readonly githubClient: GraiderReportFileGitHubClient;
  readonly repository: {
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
  };
  readonly path: string;
  readonly html: string;
  readonly beforePublish: () => Promise<boolean>;
}

export type PublishGraiderOwnedStudentReportFileResult =
  | { readonly status: "published"; readonly writePerformed: boolean }
  | { readonly status: "stale" };

export const publishGraiderOwnedStudentReportFile = async ({
  githubClient,
  repository,
  path: reportPath,
  html,
  beforePublish
}: PublishGraiderOwnedStudentReportFileInput): Promise<PublishGraiderOwnedStudentReportFileResult> => {
  const existing = await githubClient.getRepositoryFileContent(
    repository.owner,
    repository.repo,
    reportPath,
    repository.branch
  );
  if (!(await beforePublish())) return { status: "stale" };
  if (existing === html) return { status: "published", writePerformed: false };
  await githubClient.writeRepositoryFile({
    owner: repository.owner,
    repo: repository.repo,
    branch: repository.branch,
    path: reportPath,
    content: html,
    message: PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE
  });
  return { status: "published", writePerformed: true };
};

interface PublishFile {
  path: string;
  content: string;
}

export interface StudentReportPublishInput {
  githubClient: GitHubClient;
  assignment: ReportAssignmentIdentity;
  student: StudentReportSummary;
  generatedAt: string;
  studentPublishConfig?: StudentPublishConfig;
}

export interface StudentReportPublishResult {
  studentId: string;
  githubUsername: string;
  publishedFiles: string[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
  skipped: boolean;
}

const createPublishedFileReference = (owner: string, repo: string, filePath: string): string =>
  `${owner}/${repo}:${filePath}`;

const createRepositoryMissingWarning = (student: StudentReportSummary): Diagnostic =>
  createWarningDiagnostic(
    DiagnosticCode.StudentReportRepositoryMissing,
    "Student report was not published because the student repository is unavailable.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      repositoryName: student.repositoryName,
      repositoryStatus: student.repositoryStatus
    }
  );

const createWriteDiagnostic = (
  student: StudentReportSummary,
  filePath: string,
  error: unknown
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.StudentReportWriteFailed,
    "Student report publish failed.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      repositoryName: student.repositoryName,
      path: filePath,
      operation: "writeRepositoryFile",
      ...(error instanceof GitHubClientError
        ? {
            underlyingDiagnosticCode: error.diagnosticCode,
            kind: error.kind
          }
        : {})
    }
  );

const createArtifactMissingDiagnostic = (
  student: StudentReportSummary,
  artifactName: string
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.StudentReportArtifactMissing,
    "Student report source artifact was not found.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      repositoryName: student.repositoryName,
      artifact: artifactName,
      workflowRunId: student.grading.workflowRunId
    }
  );

const createSourceMissingDiagnostic = (
  student: StudentReportSummary,
  artifactName: string,
  sourceFile: string
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.StudentReportSourceMissing,
    "Student report source file was not found in the configured artifact.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      repositoryName: student.repositoryName,
      artifact: artifactName,
      sourceFile
    }
  );

const normalizeArtifactPath = (filePath: string): string => {
  const normalizedPath = filePath.trim().replace(WINDOWS_PATH_SEPARATOR_PATTERN, "/");

  return normalizedPath.startsWith(CURRENT_DIRECTORY_PREFIX)
    ? normalizedPath.slice(CURRENT_DIRECTORY_PREFIX.length)
    : normalizedPath;
};

const findArtifactText = (artifact: DownloadedArtifact, sourceFile: string): string | undefined => {
  const normalizedSourceFile = normalizeArtifactPath(sourceFile);

  return Object.entries(artifact.files).find(
    ([filePath]) => normalizeArtifactPath(filePath) === normalizedSourceFile
  )?.[1];
};

const getStudentPublishMode = (
  studentPublishConfig: StudentPublishConfig
):
  | typeof STUDENT_PUBLISH_MODE_GRAIDER_GENERATED
  | typeof STUDENT_PUBLISH_MODE_FACULTY_PROVIDED
  | typeof STUDENT_PUBLISH_MODE_BOTH
  | typeof STUDENT_PUBLISH_MODE_DISABLED => {
  if (studentPublishConfig?.enabled === false) {
    return STUDENT_PUBLISH_MODE_DISABLED;
  }

  if (studentPublishConfig?.mode === STUDENT_PUBLISH_MODE_FACULTY_PROVIDED) {
    return STUDENT_PUBLISH_MODE_FACULTY_PROVIDED;
  }

  if (studentPublishConfig?.mode === STUDENT_PUBLISH_MODE_BOTH) {
    return STUDENT_PUBLISH_MODE_BOTH;
  }

  return STUDENT_PUBLISH_MODE_GRAIDER_GENERATED;
};

const createGraiderGeneratedFiles = (
  assignment: ReportAssignmentIdentity,
  student: StudentReportSummary,
  generatedAt: string,
  studentPublishConfig: StudentPublishConfig
): PublishFile[] => [
  {
    path: studentPublishConfig?.destination_file ?? PUBLISHED_STUDENT_REPORT_PATH,
    content: renderStudentMarkdownReport(assignment, student)
  },
  {
    path: PUBLISHED_STUDENT_RESULTS_PATH,
    content: renderStudentResultsJson(assignment, student, generatedAt)
  }
];

const createBothGraiderGeneratedFile = (
  assignment: ReportAssignmentIdentity,
  student: StudentReportSummary,
  studentPublishConfig: NonNullable<StudentPublishConfig>
): PublishFile => ({
  path: studentPublishConfig.graider_report_destination ?? PUBLISHED_STUDENT_REPORT_PATH,
  content: renderStudentMarkdownReport(assignment, student)
});

const downloadFacultyProvidedArtifact = async (
  githubClient: GitHubClient,
  student: StudentReportSummary,
  artifactName: string
): Promise<DownloadedArtifact | null> => {
  if (
    student.repositoryOwner === undefined ||
    student.repositoryName === undefined ||
    student.grading.workflowRunId === undefined
  ) {
    return null;
  }

  return githubClient.downloadArtifact({
    owner: student.repositoryOwner,
    repo: student.repositoryName,
    runId: student.grading.workflowRunId,
    artifactName
  });
};

const createFacultyProvidedFile = async (
  githubClient: GitHubClient,
  student: StudentReportSummary,
  artifactName: string,
  sourceFile: string,
  destinationFile: string
): Promise<{
  file?: PublishFile;
  errors: Diagnostic[];
}> => {
  const artifact = await downloadFacultyProvidedArtifact(githubClient, student, artifactName);

  if (artifact === null) {
    return {
      errors: [createArtifactMissingDiagnostic(student, artifactName)]
    };
  }

  const content = findArtifactText(artifact, sourceFile);

  if (content === undefined) {
    return {
      errors: [createSourceMissingDiagnostic(student, artifactName, sourceFile)]
    };
  }

  return {
    file: {
      path: destinationFile,
      content
    },
    errors: []
  };
};

const createPublishFiles = async (
  input: StudentReportPublishInput
): Promise<{
  files: PublishFile[];
  errors: Diagnostic[];
  skipped: boolean;
}> => {
  const mode = getStudentPublishMode(input.studentPublishConfig);

  if (mode === STUDENT_PUBLISH_MODE_DISABLED) {
    return {
      files: [],
      errors: [],
      skipped: true
    };
  }

  if (mode === STUDENT_PUBLISH_MODE_GRAIDER_GENERATED) {
    return {
      files: createGraiderGeneratedFiles(
        input.assignment,
        input.student,
        input.generatedAt,
        input.studentPublishConfig
      ),
      errors: [],
      skipped: false
    };
  }

  if (mode === STUDENT_PUBLISH_MODE_FACULTY_PROVIDED) {
    const studentPublishConfig = input.studentPublishConfig;
    const artifactName = studentPublishConfig?.artifact ?? "";
    const sourceFile = studentPublishConfig?.source_file ?? "";
    const destinationFile = studentPublishConfig?.destination_file ?? PUBLISHED_STUDENT_REPORT_PATH;
    const facultyFile = await createFacultyProvidedFile(
      input.githubClient,
      input.student,
      artifactName,
      sourceFile,
      destinationFile
    );

    return {
      files: facultyFile.file === undefined ? [] : [facultyFile.file],
      errors: facultyFile.errors,
      skipped: false
    };
  }

  const studentPublishConfig = input.studentPublishConfig;
  const artifactName = studentPublishConfig?.artifact ?? "";
  const sourceFile = studentPublishConfig?.faculty_report_source ?? "";
  const destinationFile =
    studentPublishConfig?.faculty_report_destination ?? PUBLISHED_STUDENT_REPORT_PATH;
  const facultyFile = await createFacultyProvidedFile(
    input.githubClient,
    input.student,
    artifactName,
    sourceFile,
    destinationFile
  );
  const files = [
    createBothGraiderGeneratedFile(
      input.assignment,
      input.student,
      studentPublishConfig ?? {
        enabled: true,
        mode: STUDENT_PUBLISH_MODE_BOTH
      }
    ),
    ...(facultyFile.file === undefined ? [] : [facultyFile.file])
  ];

  return {
    files,
    errors: facultyFile.errors,
    skipped: false
  };
};

const publishFile = async (
  githubClient: GitHubClient,
  student: StudentReportSummary,
  file: PublishFile
): Promise<string> => {
  if (student.repositoryOwner === undefined || student.repositoryName === undefined) {
    return "";
  }

  await githubClient.writeRepositoryFile({
    owner: student.repositoryOwner,
    repo: student.repositoryName,
    path: file.path,
    content: file.content,
    message: PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE
  });

  return createPublishedFileReference(student.repositoryOwner, student.repositoryName, file.path);
};

export const publishStudentReport = async ({
  githubClient,
  assignment,
  student,
  generatedAt,
  studentPublishConfig
}: StudentReportPublishInput): Promise<StudentReportPublishResult> => {
  if (getStudentPublishMode(studentPublishConfig) === STUDENT_PUBLISH_MODE_DISABLED) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles: [],
      warnings: [],
      errors: [],
      skipped: true
    };
  }

  if (
    student.repositoryOwner === undefined ||
    student.repositoryName === undefined ||
    student.repositoryStatus !== "available"
  ) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles: [],
      warnings: [createRepositoryMissingWarning(student)],
      errors: [],
      skipped: true
    };
  }

  const publishedFiles: string[] = [];
  let publishPlan: Awaited<ReturnType<typeof createPublishFiles>>;

  try {
    publishPlan = await createPublishFiles({
      githubClient,
      assignment,
      student,
      generatedAt,
      studentPublishConfig
    });
  } catch (error: unknown) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: [createWriteDiagnostic(student, studentPublishConfig?.source_file ?? "", error)],
      skipped: false
    };
  }

  if (publishPlan.errors.length > EMPTY_COUNT) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: publishPlan.errors,
      skipped: false
    };
  }

  try {
    for (const file of publishPlan.files) {
      publishedFiles.push(await publishFile(githubClient, student, file));
    }

    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: [],
      skipped: false
    };
  } catch (error: unknown) {
    const attemptedPath =
      publishPlan.files[publishedFiles.length]?.path ??
      (publishedFiles.length === PUBLISHED_FILE_COUNT_PER_STUDENT - FIRST_PUBLISHED_FILE_COUNT
        ? PUBLISHED_STUDENT_RESULTS_PATH
        : PUBLISHED_STUDENT_REPORT_PATH);

    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: [createWriteDiagnostic(student, attemptedPath, error)],
      skipped: false
    };
  }
};
