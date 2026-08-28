import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runReportCommand } from "../../src/cli/commands/report.command.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import {
  FakeGitHubClient,
  type FakeRepositoryFileRecord
} from "../../src/github/fake-github-client.js";
import type {
  DownloadedArtifact,
  GitHubRepository,
  GitHubWorkflow,
  GitHubWorkflowRun
} from "../../src/github/github-models.js";

enum ReportPublishTestNumber {
  RepositoryId = 101,
  SecondRepositoryId = 102,
  WorkflowId = 202,
  WorkflowRunId = 303
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/report");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ASSIGNMENT_CONFIG_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const REPORT_TIMESTAMP = "2026-09-01T15:30:00.000Z";
const ORGANIZATION = "example-org";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const SMITH_REPOSITORY = "27s1-se2030-lab04-janesmith";
const STUDENT_REPORT_PATH = "grading/report.md";
const STUDENT_RESULTS_PATH = "grading/results.json";
const GRAIDER_REPORT_PATH = "grading/graider-report.md";
const FACULTY_SOURCE_PATH = "student-report.md";
const NESTED_FACULTY_SOURCE_PATH = "graider-output/student-report.md";
const RAW_LOG_TEXT = "RAW WORKFLOW LOG SHOULD NOT APPEAR";
const JONES_FACULTY_REPORT = "# Lab 04 Feedback\n\nJones-only feedback.\n";
const SMITH_FACULTY_REPORT = "# Lab 04 Feedback\n\nSmith-only feedback.\n";
const OLD_STUDENT_REPORT = "# Old Feedback\n";
const SECOND_RUN_WRITE_COUNT = 2;
const NO_WRITES = 0;
const jsonOptions = normalizeCommonCommandOptions({ json: true });
const yesOptions = normalizeCommonCommandOptions({ yes: true });
const fixedClock = {
  now: () => new Date(REPORT_TIMESTAMP)
};

const copyFixtureToTemp = (fixtureName: string): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graider-report-publish-`));

  fs.cpSync(sourceRoot, destinationRoot, { recursive: true });

  return destinationRoot;
};

const createRepository = (
  name: string,
  id: number = ReportPublishTestNumber.RepositoryId
): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id,
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const gradingWorkflow: GitHubWorkflow = {
  id: ReportPublishTestNumber.WorkflowId,
  path: "grade.yml",
  name: "Grade",
  supportsDispatch: true
};

const workflowRun: GitHubWorkflowRun = {
  id: ReportPublishTestNumber.WorkflowRunId,
  workflowPath: "grade.yml",
  status: "completed",
  conclusion: "success",
  headSha: "commit-sha",
  createdAt: "2026-09-01T15:00:00.000Z",
  updatedAt: "2026-09-01T15:02:00.000Z"
};

const passedResult = JSON.stringify({
  schema_version: 1,
  status: "passed",
  score: 10,
  max_score: 10,
  checks: [
    {
      name: "Unit tests",
      status: "passed",
      message: "All tests passed.",
      points_earned: 10,
      points_possible: 10,
      details: ["10 tests passed"]
    }
  ]
});

const failedResult = JSON.stringify({
  schema_version: 1,
  status: "failed",
  score: 4,
  max_score: 10,
  checks: [
    {
      name: "Style",
      status: "failed",
      message: "Style check failed.",
      points_earned: 4,
      points_possible: 10
    }
  ]
});

const createArtifact = (
  content: string,
  extraFiles: Record<string, string> = {}
): DownloadedArtifact => ({
  name: "grading-results",
  files: {
    "results.json": content,
    "raw.log": RAW_LOG_TEXT,
    ...extraFiles
  }
});

interface ReadyClientOptions {
  jonesArtifactFiles?: Record<string, string>;
  smithArtifactFiles?: Record<string, string>;
  repositoryFiles?: FakeRepositoryFileRecord[];
  includeArtifacts?: boolean;
}

const createReadyClient = ({
  jonesArtifactFiles = {},
  smithArtifactFiles = {},
  repositoryFiles = [],
  includeArtifacts = true
}: ReadyClientOptions = {}): FakeGitHubClient =>
  new FakeGitHubClient({
    repositories: [
      createRepository(JONES_REPOSITORY),
      createRepository(SMITH_REPOSITORY, ReportPublishTestNumber.SecondRepositoryId)
    ],
    workflows: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, workflow: gradingWorkflow },
      { owner: ORGANIZATION, repo: SMITH_REPOSITORY, workflow: gradingWorkflow }
    ],
    workflowRuns: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, run: workflowRun },
      { owner: ORGANIZATION, repo: SMITH_REPOSITORY, run: workflowRun }
    ],
    artifacts: includeArtifacts
      ? [
          {
            owner: ORGANIZATION,
            repo: JONES_REPOSITORY,
            runId: ReportPublishTestNumber.WorkflowRunId,
            artifact: createArtifact(passedResult, jonesArtifactFiles)
          },
          {
            owner: ORGANIZATION,
            repo: SMITH_REPOSITORY,
            runId: ReportPublishTestNumber.WorkflowRunId,
            artifact: createArtifact(failedResult, smithArtifactFiles)
          }
        ]
      : [],
    repositoryFiles
  });

const appendStudentPublishConfig = (cwd: string, yaml: string): void => {
  fs.appendFileSync(path.join(cwd, "course.yml"), `\n${yaml}`);
};

const configureFacultyProvidedPublish =
  (sourceFile: string = FACULTY_SOURCE_PATH) =>
  (cwd: string): void => {
    appendStudentPublishConfig(
      cwd,
      `  student_publish:
    enabled: true
    mode: faculty-provided
    artifact: grading-results
    source_file: ${sourceFile}
    destination_file: ${STUDENT_REPORT_PATH}
`
    );
  };

const configureBothPublish = (cwd: string): void => {
  appendStudentPublishConfig(
    cwd,
    `  student_publish:
    enabled: true
    mode: both
    graider_report_destination: ${GRAIDER_REPORT_PATH}
    faculty_report_source: ${NESTED_FACULTY_SOURCE_PATH}
    faculty_report_destination: ${STUDENT_REPORT_PATH}
    artifact: grading-results
`
  );
};

const configureDisabledPublish = (cwd: string): void => {
  appendStudentPublishConfig(
    cwd,
    `  student_publish:
    enabled: false
    mode: disabled
`
  );
};

const configureNoGradingAssignment = (cwd: string): void => {
  fs.appendFileSync(
    path.join(cwd, ASSIGNMENT_CONFIG_FILE),
    `
grading:
  enabled: false
`
  );
};

const configureNoGradingFacultyProvidedPublish = (cwd: string): void => {
  configureNoGradingAssignment(cwd);
  configureFacultyProvidedPublish(FACULTY_SOURCE_PATH)(cwd);
};

const runPublishReport = async (
  fixtureName: string,
  githubClient: FakeGitHubClient = createReadyClient(),
  publishStudentReports = true,
  configureCourse?: (cwd: string) => void
) => {
  const cwd = copyFixtureToTemp(fixtureName);
  configureCourse?.(cwd);
  const result = await runReportCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options: jsonOptions,
    githubClient,
    clock: fixedClock,
    publishStudentReports
  });

  return { cwd, result, githubClient };
};

const findWrite = (githubClient: FakeGitHubClient, repo: string, writePath: string) =>
  githubClient.mutations.fileWrites.find(
    (write) => write.repo === repo && write.path === writePath
  );

describe("graider report --publish-student-reports", () => {
  it("TC-CLI-REPORT-008 publish flag writes student repo report files", async () => {
    const { result, githubClient } = await runPublishReport("publish-success");

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(findWrite(githubClient, JONES_REPOSITORY, STUDENT_REPORT_PATH)).toBeDefined();
    expect(findWrite(githubClient, JONES_REPOSITORY, STUDENT_RESULTS_PATH)).toBeDefined();
    expect(findWrite(githubClient, SMITH_REPOSITORY, STUDENT_REPORT_PATH)).toBeDefined();
    expect(findWrite(githubClient, SMITH_REPOSITORY, STUDENT_RESULTS_PATH)).toBeDefined();
  });

  it("report without publish flag performs no repository file writes", async () => {
    const { githubClient } = await runPublishReport("publish-success", createReadyClient(), false);

    expect(githubClient.mutations.fileWrites).toHaveLength(NO_WRITES);
  });

  it("--publish-student-reports --json output is parseable and includes publish counts", async () => {
    const { result } = await runPublishReport("publish-success");
    const parsed = JSON.parse(formatCommandResultAsJson(result)) as {
      summary: {
        studentsPublished?: unknown;
        publishFailed?: unknown;
        publishSkipped?: unknown;
      };
    };

    expect(parsed.summary.studentsPublished).toBe(SECOND_RUN_WRITE_COUNT);
    expect(parsed.summary.publishFailed).toBe(NO_WRITES);
    expect(parsed.summary.publishSkipped).toBe(NO_WRITES);
  });

  it("published JSON and Markdown contain target student data only", async () => {
    const { githubClient } = await runPublishReport("publish-success");
    const jonesMarkdown = findWrite(githubClient, JONES_REPOSITORY, STUDENT_REPORT_PATH)?.content;
    const jonesJson = findWrite(githubClient, JONES_REPOSITORY, STUDENT_RESULTS_PATH)?.content;

    expect(jonesMarkdown).toContain("jones");
    expect(jonesMarkdown).not.toContain("smith");
    expect(jonesJson).toContain("jones");
    expect(jonesJson).not.toContain("smith");
  });

  it("published files do not include faculty summary or raw workflow logs", async () => {
    const { githubClient } = await runPublishReport("publish-success");
    const publishedContent = githubClient.mutations.fileWrites
      .map((write) => write.content)
      .join("\n");

    expect(publishedContent).not.toContain("faculty-summary");
    expect(publishedContent).not.toContain("student_count");
    expect(publishedContent).not.toContain(RAW_LOG_TEXT);
  });

  it("TC-REPORT-PUBLISH-005 published files overwrite current paths", async () => {
    const cwd = copyFixtureToTemp("publish-success");
    const githubClient = createReadyClient();

    await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      publishStudentReports: true
    });
    await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      publishStudentReports: true
    });

    expect(
      githubClient.mutations.fileWrites.filter(
        (write) => write.repo === JONES_REPOSITORY && write.path === STUDENT_REPORT_PATH
      )
    ).toHaveLength(SECOND_RUN_WRITE_COUNT);
  });

  it("faculty-provided mode publishes configured root artifact report content exactly", async () => {
    const githubClient = createReadyClient({
      jonesArtifactFiles: {
        [FACULTY_SOURCE_PATH]: JONES_FACULTY_REPORT
      },
      smithArtifactFiles: {
        [FACULTY_SOURCE_PATH]: SMITH_FACULTY_REPORT
      }
    });
    const { result } = await runPublishReport(
      "publish-success",
      githubClient,
      true,
      configureFacultyProvidedPublish(FACULTY_SOURCE_PATH)
    );

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(findWrite(githubClient, JONES_REPOSITORY, STUDENT_REPORT_PATH)?.content).toBe(
      JONES_FACULTY_REPORT
    );
    expect(findWrite(githubClient, SMITH_REPOSITORY, STUDENT_REPORT_PATH)?.content).toBe(
      SMITH_FACULTY_REPORT
    );
    expect(findWrite(githubClient, JONES_REPOSITORY, STUDENT_RESULTS_PATH)).toBeUndefined();
  });

  it("faculty-provided mode publishes configured nested artifact report content exactly", async () => {
    const githubClient = createReadyClient({
      jonesArtifactFiles: {
        [NESTED_FACULTY_SOURCE_PATH]: JONES_FACULTY_REPORT
      },
      smithArtifactFiles: {
        [NESTED_FACULTY_SOURCE_PATH]: SMITH_FACULTY_REPORT
      }
    });
    const { result } = await runPublishReport(
      "publish-success",
      githubClient,
      true,
      configureFacultyProvidedPublish(NESTED_FACULTY_SOURCE_PATH)
    );

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(findWrite(githubClient, JONES_REPOSITORY, STUDENT_REPORT_PATH)?.content).toBe(
      JONES_FACULTY_REPORT
    );
  });

  it("faculty-provided mode updates an existing destination file", async () => {
    const githubClient = createReadyClient({
      jonesArtifactFiles: {
        [FACULTY_SOURCE_PATH]: JONES_FACULTY_REPORT
      },
      smithArtifactFiles: {
        [FACULTY_SOURCE_PATH]: SMITH_FACULTY_REPORT
      },
      repositoryFiles: [
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          path: STUDENT_REPORT_PATH,
          content: OLD_STUDENT_REPORT,
          message: "Old report",
          commitSha: "old-report-sha"
        }
      ]
    });
    const { result } = await runPublishReport(
      "publish-success",
      githubClient,
      true,
      configureFacultyProvidedPublish(FACULTY_SOURCE_PATH)
    );

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(findWrite(githubClient, JONES_REPOSITORY, STUDENT_REPORT_PATH)?.content).toBe(
      JONES_FACULTY_REPORT
    );
  });

  it("missing faculty-provided source file reports source missing without repository missing", async () => {
    const { result, githubClient } = await runPublishReport(
      "publish-success",
      createReadyClient(),
      true,
      configureFacultyProvidedPublish(FACULTY_SOURCE_PATH)
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.StudentReportSourceMissing })
      ])
    );
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.StudentReportRepositoryMissing })
      ])
    );
    expect(githubClient.mutations.fileWrites).toHaveLength(NO_WRITES);
  });

  it("missing faculty-provided artifact reports artifact missing without repository missing", async () => {
    const { result, githubClient } = await runPublishReport(
      "publish-success",
      createReadyClient({ includeArtifacts: false }),
      true,
      configureFacultyProvidedPublish(FACULTY_SOURCE_PATH)
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.StudentReportArtifactMissing })
      ])
    );
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.StudentReportRepositoryMissing })
      ])
    );
    expect(githubClient.mutations.fileWrites).toHaveLength(NO_WRITES);
  });

  it("both mode publishes Graider-generated and faculty-provided reports to configured paths", async () => {
    const githubClient = createReadyClient({
      jonesArtifactFiles: {
        [NESTED_FACULTY_SOURCE_PATH]: JONES_FACULTY_REPORT
      },
      smithArtifactFiles: {
        [NESTED_FACULTY_SOURCE_PATH]: SMITH_FACULTY_REPORT
      }
    });
    const { result } = await runPublishReport(
      "publish-success",
      githubClient,
      true,
      configureBothPublish
    );

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(findWrite(githubClient, JONES_REPOSITORY, GRAIDER_REPORT_PATH)?.content).toContain(
      "jones"
    );
    expect(findWrite(githubClient, JONES_REPOSITORY, STUDENT_REPORT_PATH)?.content).toBe(
      JONES_FACULTY_REPORT
    );
  });

  it("disabled student publishing mode performs no repository file writes", async () => {
    const { result, githubClient } = await runPublishReport(
      "publish-success",
      createReadyClient(),
      true,
      configureDisabledPublish
    );

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.fileWrites).toHaveLength(NO_WRITES);
  });

  it("no-grading assignments still publish Graider-generated student reports", async () => {
    const { result, githubClient } = await runPublishReport(
      "publish-success",
      createReadyClient(),
      true,
      configureNoGradingAssignment
    );
    const jonesMarkdown = findWrite(githubClient, JONES_REPOSITORY, STUDENT_REPORT_PATH)?.content;

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(jonesMarkdown).toContain("Grading was not configured for this assignment.");
    expect(jonesMarkdown).not.toContain("- Score:");
    expect(findWrite(githubClient, JONES_REPOSITORY, STUDENT_RESULTS_PATH)).toBeDefined();
  });

  it("no-grading artifact-based faculty-provided publishing reports artifact missing", async () => {
    const { result, githubClient } = await runPublishReport(
      "publish-success",
      createReadyClient({
        jonesArtifactFiles: {
          [FACULTY_SOURCE_PATH]: JONES_FACULTY_REPORT
        }
      }),
      true,
      configureNoGradingFacultyProvidedPublish
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.StudentReportArtifactMissing })
      ])
    );
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.StudentReportRepositoryMissing })
      ])
    );
    expect(githubClient.mutations.fileWrites).toHaveLength(NO_WRITES);
  });

  it("publish failure for one student returns partial success when another student succeeds", async () => {
    const githubClient = createReadyClient();
    githubClient.failNext("writeRepositoryFile", "api_error");
    const { result } = await runPublishReport("publish-success", githubClient);

    expect(result.status).toBe("partial_success");
    expect(result.exitCode).toBe(ExitCode.PartialSuccess);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.StudentReportWriteFailed })
      ])
    );
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.StudentReportRepositoryMissing })
      ])
    );
  });

  it("missing manifest-tracked repository skips that student with a diagnostic", async () => {
    const { result } = await runPublishReport("valid-results");

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.StudentReportRepositoryMissing })
      ])
    );
    expect(result.summary.publishSkipped).toBeGreaterThan(NO_WRITES);
  });
});
