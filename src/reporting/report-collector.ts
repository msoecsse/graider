import type { LoadedGraiderConfig } from "../config/config-models.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { createGitHubDiagnostic, GitHubClientError } from "../github/github-errors.js";
import type { GitHubClient } from "../github/github-client.js";
import type { DownloadedArtifact, GitHubWorkflowRun } from "../github/github-models.js";
import { mapGradingStatus } from "../grading/grading-status-mapper.js";
import { parseGradingResultsJsonText } from "../grading/grading-result-validator.js";
import type {
  ArtifactStatus,
  GradingResultStatus,
  ResultFileStatus,
  WorkflowRunConclusion,
  WorkflowRunStatus
} from "../grading/grading-result-models.js";
import type { Manifest, ManifestRepositoryRecord } from "../manifest/manifest-models.js";
import type { RosterStudent, RosterSummary } from "../roster/roster-models.js";
import { getWorkflowDispatchIdentifier } from "../workflows/workflow-paths.js";
import type {
  FacultyReportSummaryCounts,
  FacultySummaryReport,
  RepositoryReportStatus,
  StudentGradingSummary,
  StudentReportSummary
} from "./report-models.js";
import { REPORT_SCHEMA_VERSION } from "./report-models.js";

const EMPTY_COUNT = 0;
const FIRST_SORT_BEFORE_SECOND = -1;
const FIRST_SORT_AFTER_SECOND = 1;
const FIRST_WORKFLOW_RUN_INDEX = 0;
const CURRENT_DIRECTORY_PREFIX = "./";
const WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g;

interface CollectReportInput {
  config: LoadedGraiderConfig;
  rosterSummary: RosterSummary;
  students: RosterStudent[];
  manifest: Manifest;
  githubClient: GitHubClient;
  generatedAt: string;
  includeArtifactFileKeys?: boolean;
}

export interface CollectReportResult {
  report: FacultySummaryReport;
}

const compareStudents = (left: RosterStudent, right: RosterStudent): number => {
  const sectionComparison = left.section.localeCompare(right.section);

  if (sectionComparison !== EMPTY_COUNT) {
    return sectionComparison;
  }

  return left.studentId.localeCompare(right.studentId);
};

const compareRuns = (left: GitHubWorkflowRun, right: GitHubWorkflowRun): number => {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);

  if (updatedComparison !== EMPTY_COUNT) {
    return updatedComparison;
  }

  return left.id < right.id ? FIRST_SORT_BEFORE_SECOND : FIRST_SORT_AFTER_SECOND;
};

const findManifestRecord = (
  manifest: Manifest,
  student: RosterStudent
): ManifestRepositoryRecord | undefined =>
  manifest.repositories.find(
    (record) => record.studentId === student.studentId && record.section === student.section
  );

const normalizeGitHubError = (error: unknown): Diagnostic =>
  error instanceof GitHubClientError
    ? createGitHubDiagnostic(error)
    : {
        code: "github_api_error",
        severity: "error",
        message: "Unexpected GitHub client failure during report collection."
      };

const getEffectiveGrading = (config: LoadedGraiderConfig) =>
  config.assignment.grading === undefined ? config.course.grading : config.assignment.grading;

const getWorkflowRunStatus = (run: GitHubWorkflowRun | undefined): WorkflowRunStatus | undefined =>
  run === undefined ? undefined : run.status;

const getWorkflowRunConclusion = (
  run: GitHubWorkflowRun | undefined
): WorkflowRunConclusion | undefined => (run === undefined ? undefined : run.conclusion);

const normalizeArtifactPath = (filePath: string): string => {
  const normalizedPath = filePath.trim().replace(WINDOWS_PATH_SEPARATOR_PATTERN, "/");

  return normalizedPath.startsWith(CURRENT_DIRECTORY_PREFIX)
    ? normalizedPath.slice(CURRENT_DIRECTORY_PREFIX.length)
    : normalizedPath;
};

const findArtifactResultText = (
  artifact: DownloadedArtifact | null,
  resultFilePath: string
): string | undefined => {
  if (artifact === null) {
    return undefined;
  }

  const normalizedResultFilePath = normalizeArtifactPath(resultFilePath);

  return Object.entries(artifact.files).find(
    ([filePath]) => normalizeArtifactPath(filePath) === normalizedResultFilePath
  )?.[1];
};

const getArtifactFileKeys = (artifact: DownloadedArtifact | null): string[] =>
  artifact === null
    ? []
    : Object.keys(artifact.files)
        .map(normalizeArtifactPath)
        .sort((left, right) => left.localeCompare(right));

const createDefaultGrading = (): StudentGradingSummary => ({
  workflowStatus: "unknown",
  resultStatus: "unknown",
  artifactStatus: "not_checked",
  resultFileStatus: "not_checked",
  checks: []
});

const collectStudentGrading = async (
  input: CollectReportInput,
  record: ManifestRepositoryRecord | undefined,
  repositoryStatus: RepositoryReportStatus
): Promise<{
  grading: StudentGradingSummary;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}> => {
  const gradingConfig = getEffectiveGrading(input.config);

  if (!gradingConfig.enabled) {
    const mapping = mapGradingStatus({
      gradingEnabled: false,
      workflowConfigured: false,
      workflowFound: false,
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });

    return {
      grading: {
        workflowStatus: mapping.workflowStatus,
        resultStatus: mapping.resultStatus,
        artifactStatus: mapping.artifactStatus,
        resultFileStatus: mapping.resultFileStatus,
        checks: []
      },
      warnings: mapping.warnings,
      errors: mapping.errors
    };
  }

  if (
    record === undefined ||
    repositoryStatus !== "available" ||
    gradingConfig.workflow === undefined ||
    gradingConfig.artifact === undefined ||
    gradingConfig.result_file === undefined
  ) {
    const mapping = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: gradingConfig.workflow !== undefined,
      workflowFound: false,
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });

    return {
      grading: {
        workflowStatus: mapping.workflowStatus,
        resultStatus: mapping.resultStatus,
        artifactStatus: mapping.artifactStatus,
        resultFileStatus: mapping.resultFileStatus,
        checks: []
      },
      warnings: mapping.warnings,
      errors: mapping.errors
    };
  }

  const workflowDispatchIdentifier = getWorkflowDispatchIdentifier(gradingConfig.workflow);
  const workflow = await input.githubClient.getWorkflow(
    record.repository.owner,
    record.repository.name,
    workflowDispatchIdentifier
  );

  if (workflow === null) {
    const mapping = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: true,
      workflowFound: false,
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });

    return {
      grading: {
        workflowStatus: mapping.workflowStatus,
        resultStatus: mapping.resultStatus,
        artifactStatus: mapping.artifactStatus,
        resultFileStatus: mapping.resultFileStatus,
        checks: []
      },
      warnings: mapping.warnings,
      errors: mapping.errors
    };
  }

  const workflowRuns = (
    await input.githubClient.listWorkflowRuns({
      owner: record.repository.owner,
      repo: record.repository.name,
      workflowPath: workflowDispatchIdentifier
    })
  ).sort(compareRuns);
  const workflowRun = workflowRuns[FIRST_WORKFLOW_RUN_INDEX];

  if (workflowRun === undefined) {
    const mapping = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: true,
      workflowFound: true,
      workflowRunStatus: "not_run",
      workflowRunConclusion: null,
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });

    return {
      grading: {
        ...mapping,
        checks: []
      },
      warnings: mapping.warnings,
      errors: mapping.errors
    };
  }

  const artifact = await input.githubClient.downloadArtifact({
    owner: record.repository.owner,
    repo: record.repository.name,
    runId: workflowRun.id,
    artifactName: gradingConfig.artifact
  });
  const artifactStatus: ArtifactStatus = artifact === null ? "missing" : "found";
  const artifactFileKeys = getArtifactFileKeys(artifact);
  const resultText = findArtifactResultText(artifact, gradingConfig.result_file);
  const resultFileStatus: ResultFileStatus =
    artifact === null ? "not_checked" : resultText === undefined ? "missing" : "valid";
  const validationResult =
    resultText === undefined ? undefined : parseGradingResultsJsonText(resultText);
  const finalResultFileStatus: ResultFileStatus =
    validationResult === undefined || validationResult.errors.length === EMPTY_COUNT
      ? resultFileStatus
      : "invalid";
  const parsedResultStatus: GradingResultStatus | undefined = validationResult?.result?.status;
  const workflowRunStatus = getWorkflowRunStatus(workflowRun);
  const workflowRunConclusion = getWorkflowRunConclusion(workflowRun);
  const mapping = mapGradingStatus({
    gradingEnabled: true,
    workflowConfigured: true,
    workflowFound: true,
    ...(workflowRunStatus === undefined ? {} : { workflowRunStatus }),
    ...(workflowRunConclusion === undefined ? {} : { workflowRunConclusion }),
    artifactStatus,
    resultFileStatus: finalResultFileStatus,
    ...(parsedResultStatus === undefined ? {} : { parsedResultStatus })
  });

  return {
    grading: {
      workflowStatus: mapping.workflowStatus,
      resultStatus: mapping.resultStatus,
      artifactStatus: mapping.artifactStatus,
      resultFileStatus: mapping.resultFileStatus,
      ...(validationResult?.result?.score === undefined
        ? {}
        : { score: validationResult.result.score }),
      ...(validationResult?.result?.maxScore === undefined
        ? {}
        : { maxScore: validationResult.result.maxScore }),
      checks: validationResult?.result?.checks ?? [],
      workflowRunId: workflowRun.id,
      commitSha: workflowRun.headSha,
      ...(input.includeArtifactFileKeys
        ? {
            artifactFileKeys,
            configuredResultFile: gradingConfig.result_file,
            normalizedResultFile: normalizeArtifactPath(gradingConfig.result_file)
          }
        : {})
    },
    warnings: [...mapping.warnings, ...(validationResult?.warnings ?? [])],
    errors: [...mapping.errors, ...(validationResult?.errors ?? [])]
  };
};

const collectRepositoryStatus = async (
  githubClient: GitHubClient,
  record: ManifestRepositoryRecord | undefined
): Promise<{
  repositoryStatus: RepositoryReportStatus;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}> => {
  if (record === undefined) {
    return {
      repositoryStatus: "not_tracked",
      warnings: [],
      errors: []
    };
  }

  const repository = await githubClient.getRepository(
    record.repository.owner,
    record.repository.name
  );

  if (repository === null) {
    return {
      repositoryStatus: "missing",
      warnings: [],
      errors: []
    };
  }

  return {
    repositoryStatus: repository.archived ? "archived" : "available",
    warnings: [],
    errors: []
  };
};

const collectStudent = async (
  input: CollectReportInput,
  student: RosterStudent
): Promise<StudentReportSummary> => {
  const record = findManifestRecord(input.manifest, student);
  const warnings = [...(record?.warnings ?? [])];
  const errors = [...(record?.errors ?? [])];

  try {
    const repository = await collectRepositoryStatus(input.githubClient, record);
    const grading = await collectStudentGrading(input, record, repository.repositoryStatus);

    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      rosterStatus: student.status,
      ...(record?.repository.owner === undefined
        ? {}
        : { repositoryOwner: record.repository.owner }),
      ...(record?.repository.name === undefined ? {} : { repositoryName: record.repository.name }),
      ...(record?.repository.htmlUrl === undefined
        ? {}
        : { repositoryUrl: record.repository.htmlUrl }),
      repositoryStatus: repository.repositoryStatus,
      grading: grading.grading,
      warnings: [...warnings, ...repository.warnings, ...grading.warnings],
      errors: [...errors, ...repository.errors, ...grading.errors]
    };
  } catch (error: unknown) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      rosterStatus: student.status,
      ...(record?.repository.owner === undefined
        ? {}
        : { repositoryOwner: record.repository.owner }),
      ...(record?.repository.name === undefined ? {} : { repositoryName: record.repository.name }),
      ...(record?.repository.htmlUrl === undefined
        ? {}
        : { repositoryUrl: record.repository.htmlUrl }),
      repositoryStatus: "missing",
      grading: createDefaultGrading(),
      warnings,
      errors: [...errors, normalizeGitHubError(error)]
    };
  }
};

const countResultStatus = (
  students: readonly StudentReportSummary[],
  status: GradingResultStatus
): number => students.filter((student) => student.grading.resultStatus === status).length;

const countDiagnostics = (
  students: readonly StudentReportSummary[],
  fieldName: "warnings" | "errors"
): number => students.reduce((total, student) => total + student[fieldName].length, EMPTY_COUNT);

const createSummary = (
  rosterSummary: RosterSummary,
  students: readonly StudentReportSummary[]
): FacultyReportSummaryCounts => ({
  studentCount: rosterSummary.studentCount,
  activeStudentCount: rosterSummary.activeStudentCount,
  droppedStudentCount: rosterSummary.droppedStudentCount,
  holdStudentCount: rosterSummary.holdStudentCount,
  passedCount: countResultStatus(students, "passed"),
  failedCount: countResultStatus(students, "failed"),
  errorCount: countResultStatus(students, "error"),
  skippedCount: countResultStatus(students, "skipped"),
  notConfiguredCount: countResultStatus(students, "not_configured"),
  missingArtifactCount: countResultStatus(students, "missing_artifact"),
  invalidResultFileCount: countResultStatus(students, "invalid_result_file"),
  warningCount: countDiagnostics(students, "warnings"),
  errorCountTotal: countDiagnostics(students, "errors")
});

export const collectReport = async (input: CollectReportInput): Promise<CollectReportResult> => {
  const students: StudentReportSummary[] = [];
  const sortedStudents = [...input.students].sort(compareStudents);

  for (const student of sortedStudents) {
    students.push(await collectStudent(input, student));
  }

  return {
    report: {
      schemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt: input.generatedAt,
      assignment: {
        courseCode: input.config.course.course.code,
        termCode: input.config.summary.termCode,
        assignmentSlug: input.config.summary.assignmentSlug,
        assignmentTitle: input.config.assignment.assignment.title
      },
      source: {
        inputFingerprint: input.manifest.source.inputFingerprint
      },
      summary: createSummary(input.rosterSummary, students),
      students,
      warnings: input.manifest.warnings,
      errors: input.manifest.errors
    }
  };
};
