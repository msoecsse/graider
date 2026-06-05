import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runReportCommand } from "../../src/cli/commands/report.command.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubClient } from "../../src/github/github-client.js";
import type {
  DownloadArtifactInput,
  DownloadedArtifact,
  GitHubRepository,
  GitHubWorkflow,
  GitHubWorkflowRun
} from "../../src/github/github-models.js";
import {
  OctokitGitHubClient,
  type OctokitRestClientLike
} from "../../src/github/octokit-github-client.js";

enum ReportTestNumber {
  RepositoryId = 101,
  WorkflowId = 202,
  WorkflowRunId = 303,
  ArtifactId = 404
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/report");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const REPORT_TIMESTAMP = "2026-09-01T15:30:00.000Z";
const ORGANIZATION = "example-org";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const SMITH_REPOSITORY = "27s1-se2030-lab04-janesmith";
const RAW_LOG_TEXT = "RAW WORKFLOW LOG SHOULD NOT APPEAR";
const TOKEN = "ghp_reporttesttoken1234567890";
const GRADING_RESULTS_ARTIFACT_ZIP_BASE64 =
  "UEsDBAoAAAAAAIVdxFyJpcG3MgAAADIAAAAUABwAZ3JhZGluZy1yZXN1bHRzLmpzb25VVAkAA1mrIWpZqyFqdXgLAAEE9QEAAAQUAAAAeyJzY2hlbWFfdmVyc2lvbiI6MSwic3RhdHVzIjoicGFzc2VkIiwiY2hlY2tzIjpbXX1QSwECHgMKAAAAAACFXcRciaXBtzIAAAAyAAAAFAAYAAAAAAABAAAApIEAAAAAZ3JhZGluZy1yZXN1bHRzLmpzb25VVAUAA1mrIWp1eAsAAQT1AQAABBQAAABQSwUGAAAAAAEAAQBaAAAAgAAAAAAA";
const BASE64_ENCODING = "base64";
const FIXTURE_RESULT_FILE_LINE = "result_file: results.json";
const LIVE_STYLE_RESULT_FILE_LINE = "result_file: grading-results.json";
const LIVE_STYLE_RESULT_FILE_WITH_TRAILING_SPACE_LINE = 'result_file: "grading-results.json "';
const yesOptions = normalizeCommonCommandOptions({ yes: true });
const jsonOptions = normalizeCommonCommandOptions({ json: true });
const verboseOptions = normalizeCommonCommandOptions({ verbose: true, yes: true });
const fixedClock = {
  now: () => new Date(REPORT_TIMESTAMP)
};

const copyFixtureToTemp = (fixtureName: string): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graider-report-${fixtureName}-`));

  fs.cpSync(sourceRoot, destinationRoot, {
    recursive: true
  });

  return destinationRoot;
};

const createRepository = (name: string): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id: ReportTestNumber.RepositoryId,
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const gradingWorkflow: GitHubWorkflow = {
  id: ReportTestNumber.WorkflowId,
  path: "grade.yml",
  name: "Grade",
  supportsDispatch: true
};

const workflowRun: GitHubWorkflowRun = {
  id: ReportTestNumber.WorkflowRunId,
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
    },
    {
      name: "Runtime",
      status: "error",
      message: "Runtime error."
    },
    {
      name: "Extra credit",
      status: "skipped",
      details: ["Skipped because prerequisite failed."]
    }
  ]
});

const createArtifact = (content: string = passedResult): DownloadedArtifact => ({
  name: "grading-results",
  files: {
    "results.json": content,
    "raw.log": RAW_LOG_TEXT
  }
});

const createReadyClient = (
  artifact: DownloadedArtifact | null = createArtifact()
): FakeGitHubClient =>
  new FakeGitHubClient({
    repositories: [createRepository(JONES_REPOSITORY), createRepository(SMITH_REPOSITORY)],
    workflows: [
      {
        owner: ORGANIZATION,
        repo: JONES_REPOSITORY,
        workflow: gradingWorkflow
      },
      {
        owner: ORGANIZATION,
        repo: SMITH_REPOSITORY,
        workflow: gradingWorkflow
      }
    ],
    workflowRuns: [
      {
        owner: ORGANIZATION,
        repo: JONES_REPOSITORY,
        run: workflowRun
      },
      {
        owner: ORGANIZATION,
        repo: SMITH_REPOSITORY,
        run: workflowRun
      }
    ],
    artifacts:
      artifact === null
        ? []
        : [
            {
              owner: ORGANIZATION,
              repo: JONES_REPOSITORY,
              runId: ReportTestNumber.WorkflowRunId,
              artifact
            },
            {
              owner: ORGANIZATION,
              repo: SMITH_REPOSITORY,
              runId: ReportTestNumber.WorkflowRunId,
              artifact: createArtifact(failedResult)
            }
          ]
  });

interface ReadableArtifactStreamLike {
  getReader: () => {
    read: () => Promise<{ done: boolean; value?: Buffer }>;
  };
}

class OctokitArtifactReportClient extends FakeGitHubClient {
  private readonly artifactClient: OctokitGitHubClient;

  constructor(artifactClient: OctokitGitHubClient) {
    super({
      repositories: [createRepository(JONES_REPOSITORY), createRepository(SMITH_REPOSITORY)],
      workflows: [
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          workflow: gradingWorkflow
        },
        {
          owner: ORGANIZATION,
          repo: SMITH_REPOSITORY,
          workflow: gradingWorkflow
        }
      ],
      workflowRuns: [
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          run: workflowRun
        },
        {
          owner: ORGANIZATION,
          repo: SMITH_REPOSITORY,
          run: workflowRun
        }
      ]
    });
    this.artifactClient = artifactClient;
  }

  override downloadArtifact(input: DownloadArtifactInput): Promise<DownloadedArtifact | null> {
    return this.artifactClient.downloadArtifact(input);
  }
}

const createReadableArtifactStream = (content: Buffer): ReadableArtifactStreamLike => {
  let unread = true;

  return {
    getReader: () => ({
      read: () => {
        const result = unread ? { done: false, value: content } : { done: true };
        unread = false;

        return Promise.resolve(result);
      }
    })
  };
};

const createOctokitArtifactReportClient = (
  downloadData: unknown = createReadableArtifactStream(
    Buffer.from(GRADING_RESULTS_ARTIFACT_ZIP_BASE64, BASE64_ENCODING)
  )
): OctokitArtifactReportClient => {
  const octokit: OctokitRestClientLike = {
    ...createUnusedOctokit(),
    rest: {
      ...createUnusedOctokit().rest,
      actions: {
        ...createUnusedOctokit().rest.actions,
        listWorkflowRunArtifacts: () =>
          Promise.resolve({
            data: {
              artifacts: [
                {
                  id: ReportTestNumber.ArtifactId,
                  name: "grading-results"
                }
              ]
            }
          }),
        downloadArtifact: () =>
          Promise.resolve({
            data: downloadData
          })
      }
    }
  };

  return new OctokitArtifactReportClient(new OctokitGitHubClient({ token: TOKEN, octokit }));
};

const createUnusedOctokit = (): OctokitRestClientLike => {
  const unusedMethod = () => Promise.resolve({ data: {} });

  return {
    rest: {
      users: {
        getAuthenticated: unusedMethod,
        getByUsername: unusedMethod
      },
      repos: {
        get: unusedMethod,
        createUsingTemplate: unusedMethod,
        listBranches: unusedMethod,
        listCollaborators: unusedMethod,
        listCommits: unusedMethod,
        getContent: unusedMethod,
        getCollaboratorPermissionLevel: unusedMethod,
        addCollaborator: unusedMethod,
        removeCollaborator: unusedMethod,
        update: unusedMethod,
        createOrUpdateFileContents: unusedMethod
      },
      teams: {
        getByName: unusedMethod,
        checkPermissionsForRepoInOrg: unusedMethod,
        addOrUpdateRepoPermissionsInOrg: unusedMethod
      },
      actions: {
        getGithubActionsPermissionsRepository: unusedMethod,
        setGithubActionsPermissionsRepository: unusedMethod,
        getWorkflow: unusedMethod,
        createWorkflowDispatch: unusedMethod,
        listWorkflowRuns: unusedMethod,
        listWorkflowRunsForRepo: unusedMethod,
        listWorkflowRunArtifacts: unusedMethod,
        downloadArtifact: unusedMethod
      }
    },
    paginate: () => Promise.resolve([]),
    request: unusedMethod
  };
};

const runReport = async (
  fixtureName: string,
  githubClient: GitHubClient = createReadyClient(),
  options = yesOptions
) => {
  const cwd = copyFixtureToTemp(fixtureName);
  const result = await runReportCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options,
    githubClient,
    clock: fixedClock
  });

  return { cwd, result, githubClient };
};

const reportPath = (cwd: string, relativePath: string): string => path.join(cwd, relativePath);

const setLiveStyleResultFile = (cwd: string): void => {
  const coursePath = reportPath(cwd, "course.yml");
  const courseText = fs.readFileSync(coursePath, "utf8");

  fs.writeFileSync(
    coursePath,
    courseText.replace(FIXTURE_RESULT_FILE_LINE, LIVE_STYLE_RESULT_FILE_LINE),
    "utf8"
  );
};

const setLiveStyleResultFileWithTrailingSpace = (cwd: string): void => {
  const coursePath = reportPath(cwd, "course.yml");
  const courseText = fs.readFileSync(coursePath, "utf8");

  fs.writeFileSync(
    coursePath,
    courseText.replace(FIXTURE_RESULT_FILE_LINE, LIVE_STYLE_RESULT_FILE_WITH_TRAILING_SPACE_LINE),
    "utf8"
  );
};

describe("graider report command", () => {
  it("TC-CLI-REPORT-001 missing manifest fails", async () => {
    const { result } = await runReport("missing-manifest");

    expect(result.exitCode).toBe(ExitCode.ConfigurationOrSchemaError);
    expect(result.errors).toEqual([expect.objectContaining({ code: "manifest_missing" })]);
  });

  it("TC-CLI-REPORT-002 generates Markdown, CSV, and JSON faculty reports", async () => {
    const { cwd, result } = await runReport("valid-results");

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(fs.existsSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.json"))).toBe(
      true
    );
    expect(fs.existsSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.csv"))).toBe(
      true
    );
    expect(fs.existsSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.md"))).toBe(
      true
    );
  });

  it("TC-CLI-REPORT-003 generates student Markdown reports split by section", async () => {
    const { cwd, result } = await runReport("valid-results");

    expect(result.generatedFiles).toEqual(
      expect.arrayContaining([
        "terms/27s1/reports/lab04/students/001/jones.md",
        "terms/27s1/reports/lab04/students/001/smith.md",
        "terms/27s1/reports/lab04/students/002/lee.md"
      ])
    );
    expect(fs.existsSync(reportPath(cwd, "terms/27s1/reports/lab04/students/002/lee.md"))).toBe(
      true
    );
  });

  it("TC-CLI-REPORT-004 grading disabled reports not_configured", async () => {
    const { cwd } = await runReport("grading-disabled");
    const summary = JSON.parse(
      fs.readFileSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.json"), "utf8")
    ) as { students: Array<{ grading: { result_status: string } }> };

    expect(summary.students[0]?.grading.result_status).toBe("not_configured");
  });

  it("TC-CLI-REPORT-005 missing artifact reports missing_artifact", async () => {
    const { cwd } = await runReport("valid-results", createReadyClient(null));
    const markdown = fs.readFileSync(
      reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.md"),
      "utf8"
    );

    expect(markdown).toContain("missing_artifact");
  });

  it("TC-CLI-REPORT-006 invalid result file reports invalid_result_file", async () => {
    const { cwd } = await runReport("valid-results", createReadyClient(createArtifact("{")));
    const summary = JSON.parse(
      fs.readFileSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.json"), "utf8")
    ) as { students: Array<{ grading: { result_status: string } }> };

    expect(summary.students[0]?.grading.result_status).toBe("invalid_result_file");
  });

  it("TC-CLI-REPORT-011 normalizes artifact entry paths before result lookup", async () => {
    const { cwd } = await runReport(
      "valid-results",
      createReadyClient({
        name: "grading-results",
        files: {
          ".\\results.json": passedResult
        }
      })
    );
    const summary = JSON.parse(
      fs.readFileSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.json"), "utf8")
    ) as {
      students: Array<{
        grading: { result_file_status: string; result_status: string };
      }>;
    };

    expect(summary.students[0]?.grading.result_file_status).toBe("valid");
    expect(summary.students[0]?.grading.result_status).toBe("passed");
  });

  it("TC-CLI-REPORT-012 reports results extracted through Octokit artifact download", async () => {
    const cwd = copyFixtureToTemp("valid-results");
    setLiveStyleResultFile(cwd);
    await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient: createOctokitArtifactReportClient(),
      clock: fixedClock
    });
    const summary = JSON.parse(
      fs.readFileSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.json"), "utf8")
    ) as {
      students: Array<{
        grading: { artifact_status: string; result_file_status: string; result_status: string };
      }>;
    };

    expect(summary.students[0]?.grading.artifact_status).toBe("found");
    expect(summary.students[0]?.grading.result_file_status).toBe("valid");
    expect(summary.students[0]?.grading.result_status).toBe("passed");
  });

  it("TC-CLI-REPORT-013 reports artifact extraction failure as a GitHub error", async () => {
    const cwd = copyFixtureToTemp("valid-results");
    setLiveStyleResultFile(cwd);
    await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient: createOctokitArtifactReportClient({
        archive_download_url: "https://artifact.example/download.zip"
      }),
      clock: fixedClock
    });
    const summary = JSON.parse(
      fs.readFileSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.json"), "utf8")
    ) as {
      students: Array<{
        grading: { result_file_status: string; result_status: string };
        errors: Array<{ code: string }>;
      }>;
    };

    expect(summary.students[0]?.grading.result_file_status).not.toBe("missing");
    expect(summary.students[0]?.grading.result_status).not.toBe("missing_result_file");
    expect(summary.students[0]?.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "github_api_error" })])
    );
  });

  it("TC-CLI-REPORT-014 verbose JSON includes downloaded artifact file keys", async () => {
    const cwd = copyFixtureToTemp("valid-results");
    setLiveStyleResultFile(cwd);
    await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: verboseOptions,
      githubClient: createOctokitArtifactReportClient(),
      clock: fixedClock
    });
    const summary = JSON.parse(
      fs.readFileSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.json"), "utf8")
    ) as {
      students: Array<{
        grading: { artifact_file_keys?: string[]; result_file_status: string };
      }>;
    };

    expect(summary.students[0]?.grading.result_file_status).toBe("valid");
    expect(summary.students[0]?.grading.artifact_file_keys).toEqual(["grading-results.json"]);
  });

  it("TC-CLI-REPORT-016 normalizes configured result_file before artifact lookup", async () => {
    const cwd = copyFixtureToTemp("valid-results");
    setLiveStyleResultFileWithTrailingSpace(cwd);
    await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: verboseOptions,
      githubClient: createOctokitArtifactReportClient(),
      clock: fixedClock
    });
    const summary = JSON.parse(
      fs.readFileSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.json"), "utf8")
    ) as {
      students: Array<{
        grading: {
          artifact_file_keys?: string[];
          configured_result_file?: string;
          normalized_result_file?: string;
          result_file_status: string;
          result_status: string;
        };
      }>;
    };

    expect(summary.students[0]?.grading.artifact_file_keys).toEqual(["grading-results.json"]);
    expect(summary.students[0]?.grading.configured_result_file).toBe("grading-results.json ");
    expect(summary.students[0]?.grading.normalized_result_file).toBe("grading-results.json");
    expect(summary.students[0]?.grading.result_file_status).toBe("valid");
    expect(summary.students[0]?.grading.result_status).toBe("passed");
  });

  it("TC-CLI-REPORT-015 missing_result_file is used only after extraction finds other files", async () => {
    const cwd = copyFixtureToTemp("valid-results");
    setLiveStyleResultFile(cwd);
    await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: verboseOptions,
      githubClient: createReadyClient({
        name: "grading-results",
        files: {
          "other-result.json": passedResult
        }
      }),
      clock: fixedClock
    });
    const summary = JSON.parse(
      fs.readFileSync(reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.json"), "utf8")
    ) as {
      students: Array<{
        grading: {
          artifact_file_keys?: string[];
          result_file_status: string;
          result_status: string;
        };
      }>;
    };

    expect(summary.students[0]?.grading.artifact_file_keys).toEqual(["other-result.json"]);
    expect(summary.students[0]?.grading.result_file_status).toBe("missing");
    expect(summary.students[0]?.grading.result_status).toBe("missing_result_file");
  });

  it("TC-CLI-REPORT-007 report without publish flag does not commit to student repos", async () => {
    const githubClient = createReadyClient();
    await runReport("valid-results", githubClient);

    expect(githubClient.mutations.fileWrites).toEqual([]);
  });

  it("TC-CLI-REPORT-009 report files overwrite current paths", async () => {
    const cwd = copyFixtureToTemp("valid-results");
    const githubClient = createReadyClient();
    const facultyPath = reportPath(cwd, "terms/27s1/reports/lab04/faculty-summary.md");
    fs.mkdirSync(path.dirname(facultyPath), { recursive: true });
    fs.writeFileSync(facultyPath, "stale report", "utf8");

    await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });

    expect(fs.readFileSync(facultyPath, "utf8")).not.toContain("stale report");
  });

  it("TC-CLI-REPORT-010 --json references generated report paths", async () => {
    const { result } = await runReport("valid-results", createReadyClient(), jsonOptions);
    const json = JSON.parse(formatCommandResultAsJson(result)) as { generatedFiles: string[] };

    expect(json.generatedFiles).toContain("terms/27s1/reports/lab04/faculty-summary.json");
    expect(json.generatedFiles.every((filePath) => !path.isAbsolute(filePath))).toBe(true);
    expect(json.generatedFiles.every((filePath) => !filePath.includes("\\"))).toBe(true);
  });
});
