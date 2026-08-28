import fs from "node:fs";
import { loadGraiderConfig } from "../config/config-loader.js";
import type { LoadedGraiderConfig, RawCourseConfig } from "../config/config-models.js";
import { DISABLED_GRADING_MODE, DISABLED_STUDENT_PUBLISH_MODE } from "../config/config-schemas.js";
import type { CommandStatus } from "../core/command-result.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import { loadAssignmentRosters } from "../roster/roster-loader.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import {
  ASSIGNMENT_DETAIL_SCHEMA_VERSION,
  type AssignmentDetailActions,
  type AssignmentDetailApplyState,
  type AssignmentDetailCheckStatus,
  type AssignmentDetailGrading,
  type AssignmentDetailResult,
  type AssignmentDetailRoster,
  type AssignmentDetailStudentReports
} from "./assignment-detail-models.js";
import { checkAssignmentDetailGithubReadiness } from "./assignment-detail-github-readiness.js";

const COMMAND_NAME = "assignment detail";
const EMPTY_COUNT = 0;
const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_FAILURE = 1;
const EXIT_CODE_PARTIAL_SUCCESS = 2;
const LEGACY_GRADING_MODE = "custom-workflow";
const PRESET_GRADING_MODE = "preset";
const ACTIVE_ASSIGNMENT_STATUS = "active";
const CLOSED_ASSIGNMENT_STATUS = "closed";
const DRAFT_ASSIGNMENT_STATUS = "draft";
const ARCHIVED_ASSIGNMENT_STATUS = "archived";
const NOT_CHECKED_STATUS: AssignmentDetailCheckStatus = "not_checked";
const NOT_REQUIRED_STATUS: AssignmentDetailCheckStatus = "not_required";
const AVAILABLE_STATUS: AssignmentDetailCheckStatus = "available";
const APPLY_STATE_APPLIED: AssignmentDetailApplyState = "applied";
const APPLY_STATE_NOT_APPLIED: AssignmentDetailApplyState = "not_applied";

export interface BuildAssignmentDetailInput {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly githubClient?: GitHubClient;
}

const resolveExitCode = (status: CommandStatus): 0 | 1 | 2 => {
  if (status === "success") {
    return EXIT_CODE_SUCCESS;
  }

  return status === "partial_success" ? EXIT_CODE_PARTIAL_SUCCESS : EXIT_CODE_FAILURE;
};

export const createEmptyAssignmentDetailResult = (
  status: CommandStatus,
  diagnostics: Diagnostic[]
): AssignmentDetailResult => ({
  schemaVersion: ASSIGNMENT_DETAIL_SCHEMA_VERSION,
  commandName: COMMAND_NAME,
  status,
  exitCode: resolveExitCode(status),
  diagnostics,
  course: null,
  term: null,
  assignment: null,
  metadata: null,
  deadline: null,
  sections: [],
  roster: null,
  template: null,
  grading: null,
  studentReports: null,
  applyState: null,
  actions: null
});

const hasErrorDiagnostics = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === "error");

const getEffectiveGrading = (config: LoadedGraiderConfig): RawCourseConfig["grading"] =>
  config.assignment.grading ?? config.course.grading;

const createRosterSummary = (
  config: LoadedGraiderConfig
): {
  readonly roster: AssignmentDetailRoster;
  readonly diagnostics: Diagnostic[];
} => {
  const rosterResult = loadAssignmentRosters(config);

  return {
    roster: {
      sectionCount: config.assignment.sections.length,
      activeStudentCount: rosterResult.summary.activeStudentCount,
      totalStudentCount: rosterResult.summary.studentCount
    },
    diagnostics: [...rosterResult.warnings, ...rosterResult.errors]
  };
};

const isFile = (filePath: string): boolean => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const getApplyState = (config: LoadedGraiderConfig): AssignmentDetailApplyState => {
  const manifestPath = createManifestPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );

  return isFile(manifestPath.absolutePath) ? APPLY_STATE_APPLIED : APPLY_STATE_NOT_APPLIED;
};

const createGradingDetail = (config: LoadedGraiderConfig): AssignmentDetailGrading => {
  const grading = getEffectiveGrading(config);

  if (!grading.enabled) {
    return {
      enabled: false,
      mode: grading.mode ?? DISABLED_GRADING_MODE,
      workflow: null,
      artifact: null,
      resultFile: null,
      workflowStatus: NOT_REQUIRED_STATUS,
      workflowDispatch: NOT_REQUIRED_STATUS
    };
  }

  return {
    enabled: true,
    mode: grading.mode ?? LEGACY_GRADING_MODE,
    workflow: grading.workflow ?? null,
    artifact: grading.artifact ?? null,
    resultFile: grading.result_file ?? null,
    workflowStatus: NOT_CHECKED_STATUS,
    workflowDispatch: NOT_CHECKED_STATUS
  };
};

const nullable = (value: string | undefined): string | null => value ?? null;

const createStudentReports = (config: LoadedGraiderConfig): AssignmentDetailStudentReports => {
  const studentPublish = config.course.reports.student_publish;

  if (studentPublish === undefined) {
    return {
      enabled: false,
      mode: DISABLED_STUDENT_PUBLISH_MODE,
      artifact: null,
      sourceFile: null,
      destinationFile: null,
      graiderReportDestination: null,
      facultyReportSource: null,
      facultyReportDestination: null
    };
  }

  return {
    enabled: studentPublish.enabled,
    mode: studentPublish.mode ?? DISABLED_STUDENT_PUBLISH_MODE,
    artifact: nullable(studentPublish.artifact),
    sourceFile: nullable(studentPublish.source_file),
    destinationFile: nullable(studentPublish.destination_file),
    graiderReportDestination: nullable(studentPublish.graider_report_destination),
    facultyReportSource: nullable(studentPublish.faculty_report_source),
    facultyReportDestination: nullable(studentPublish.faculty_report_destination)
  };
};

const action = (
  available: boolean,
  implemented: boolean
): { available: boolean; implemented: boolean } => ({
  available,
  implemented
});

const createActions = (
  config: LoadedGraiderConfig,
  grading: AssignmentDetailGrading,
  studentReports: AssignmentDetailStudentReports
): AssignmentDetailActions => {
  const assignmentStatus = config.assignment.assignment.status;
  const applyAvailable =
    assignmentStatus === ACTIVE_ASSIGNMENT_STATUS || assignmentStatus === CLOSED_ASSIGNMENT_STATUS;
  const lifecycleAllowsGrading =
    assignmentStatus !== DRAFT_ASSIGNMENT_STATUS && assignmentStatus !== ARCHIVED_ASSIGNMENT_STATUS;

  return {
    validate: action(true, true),
    apply: action(applyAvailable, false),
    grade: action(
      grading.enabled &&
        lifecycleAllowsGrading &&
        grading.workflowStatus === AVAILABLE_STATUS &&
        grading.workflowDispatch === AVAILABLE_STATUS,
      false
    ),
    report: action(true, false),
    publishStudentReports: action(studentReports.enabled, false),
    generateWorkflow: action(grading.enabled && grading.mode === PRESET_GRADING_MODE, false)
  };
};

export const buildAssignmentDetail = ({
  cwd,
  assignmentFile,
  githubClient
}: BuildAssignmentDetailInput): Promise<AssignmentDetailResult> => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });

  if (configResult.status === "failure") {
    return Promise.resolve(createEmptyAssignmentDetailResult("failure", configResult.diagnostics));
  }

  const { config } = configResult;
  const rosterResult = createRosterSummary(config);
  const localDiagnostics = [...configResult.diagnostics, ...rosterResult.diagnostics];
  const localGrading = createGradingDetail(config);
  const studentReports = createStudentReports(config);
  const template = {
    repository: config.assignment.template.repository,
    branch: config.assignment.template.branch,
    status: NOT_CHECKED_STATUS,
    repositoryStatus: NOT_CHECKED_STATUS,
    branchStatus: NOT_CHECKED_STATUS
  };

  return checkAssignmentDetailGithubReadiness({
    config,
    template,
    grading: localGrading,
    ...(githubClient === undefined ? {} : { githubClient })
  }).then((githubReadiness) => {
    const diagnostics = [...localDiagnostics, ...githubReadiness.diagnostics];
    const status =
      diagnostics.length === EMPTY_COUNT
        ? "success"
        : hasErrorDiagnostics(diagnostics)
          ? "partial_success"
          : "success";

    return {
      schemaVersion: ASSIGNMENT_DETAIL_SCHEMA_VERSION,
      commandName: COMMAND_NAME,
      status,
      exitCode: resolveExitCode(status),
      diagnostics,
      course: {
        slug: config.course.course.code,
        title: config.course.course.title,
        file: config.summary.courseConfigPath
      },
      term: {
        slug: config.term.term.code,
        title: config.term.term.display_name,
        file: config.summary.termConfigPath
      },
      assignment: {
        slug: config.assignment.assignment.slug,
        title: config.assignment.assignment.title,
        type: config.assignment.assignment.type,
        status: config.assignment.assignment.status,
        file: config.summary.assignmentConfigPath
      },
      metadata: {
        facultyOwner: config.assignment.metadata?.faculty_owner ?? null,
        lmsAssignmentId: config.assignment.metadata?.lms_assignment_id ?? null,
        gradingCategory: config.assignment.metadata?.grading_category ?? null,
        points: config.assignment.metadata?.points ?? null
      },
      deadline:
        config.assignment.deadline === undefined
          ? null
          : {
              dueAt: config.assignment.deadline.due_at,
              latePolicy: config.assignment.deadline.late_policy
            },
      sections: config.assignment.sections,
      roster: rosterResult.roster,
      template: githubReadiness.template,
      grading: githubReadiness.grading,
      studentReports,
      applyState: {
        status: getApplyState(config)
      },
      actions: createActions(config, githubReadiness.grading, studentReports)
    };
  });
};
