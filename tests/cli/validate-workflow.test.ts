import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runValidateCommand } from "../../src/cli/commands/validate.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import {
  FakeGitHubClient,
  type FakeRepositoryFileRecord
} from "../../src/github/fake-github-client.js";
import type { GitHubTemplateRepository } from "../../src/github/github-models.js";

enum TestNumber {
  TemplateRepositoryId = 101
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/roster/valid-course");
const TEMP_FIXTURE_PREFIX = "graider-validate-workflow-";
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const COURSE_FILE = "course.yml";
const ASSIGNMENT_CONFIG_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const CONFIGURED_WORKFLOW_FILE = ".github/workflows/grade.yml";
const LEGACY_WORKFLOW_FILE = "grade.yml";
const GENERATED_WORKFLOW_FILE = "terms/27s1/generated-workflows/lab04/grade.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const FACULTY_TEAM = "faculty";
const GRADER_TEAM = "graders";
const STUDENT_USERNAMES = ["seanjones", "janesmith", "alexlee", "mayapatel"] as const;
const TEMPLATE_WORKFLOW_COMMIT_SHA = "template-workflow-sha";
const LEGACY_COURSE_GRADING_BLOCK = `grading:
  enabled: true
  workflow: grade.yml
  artifact: grading-results
  result_file: results.json
`;
const PRESET_GRADING_BLOCK = `grading:
  enabled: true
  mode: preset
  preset: java-junit-checkstyle
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`;
const CUSTOM_WORKFLOW_GRADING_BLOCK = `grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`;
const CONTRACT_ONLY_GRADING_BLOCK = `grading:
  enabled: true
  mode: contract-only
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`;
const MISSING_WORKFLOW_PATH_GRADING_BLOCK = `grading:
  enabled: true
  mode: custom-workflow
  artifact: grading-results
  result_file: grading-results.json
`;
const MISSING_ARTIFACT_GRADING_BLOCK = `grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  result_file: grading-results.json
`;
const MISSING_RESULT_FILE_GRADING_BLOCK = `grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  artifact: grading-results
`;
const DISABLED_ASSIGNMENT_GRADING_BLOCK = `grading:
  enabled: false
`;
const EXPLICIT_DISABLED_ASSIGNMENT_GRADING_BLOCK = `grading:
  enabled: false
  mode: no-grading
`;
const REPORT_PUBLISHING_BLOCK = `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: graider-generated
    destination_file: grading/report.md
`;
const LIST_STYLE_DISPATCH_WORKFLOW = `name: Grade
on:
  - push
  - repository_dispatch
  - workflow_dispatch
jobs:
  grade:
    runs-on: ubuntu-latest
    steps:
      - run: echo "grade"
`;
const OBJECT_STYLE_DISPATCH_WORKFLOW = `name: Grade
on:
  push:
  repository_dispatch:
  workflow_dispatch:
jobs:
  grade:
    runs-on: ubuntu-latest
    steps:
      - run: echo "grade"
`;
const NO_DISPATCH_WORKFLOW = `name: Grade
on:
  - push
jobs:
  grade:
    runs-on: ubuntu-latest
    steps:
      - run: echo "grade"
`;

const options = normalizeCommonCommandOptions({});

const templateRepository: GitHubTemplateRepository = {
  owner: ORGANIZATION,
  name: TEMPLATE_REPO,
  fullName: `${ORGANIZATION}/${TEMPLATE_REPO}`,
  id: TestNumber.TemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${TEMPLATE_REPO}`,
  isTemplate: true,
  branches: [TEMPLATE_BRANCH],
  files: [README_FILE],
  latestCommitSha: "template-sha"
};

const createReadyClient = (repositoryFiles: FakeRepositoryFileRecord[] = []): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository],
    users: STUDENT_USERNAMES.map((username) => ({ username })),
    teams: [
      { org: ORGANIZATION, slug: FACULTY_TEAM, name: "Faculty" },
      { org: ORGANIZATION, slug: GRADER_TEAM, name: "Graders" }
    ],
    repositoryFiles
  });

const copyFixtureToTemp = (): string => {
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_FIXTURE_PREFIX));
  fs.cpSync(FIXTURE_ROOT, destinationRoot, { recursive: true });
  return destinationRoot;
};

const replaceCourseGrading = (cwd: string, grading: string): void => {
  const coursePath = path.join(cwd, COURSE_FILE);
  const content = fs.readFileSync(coursePath, "utf8");

  fs.writeFileSync(coursePath, content.replace(LEGACY_COURSE_GRADING_BLOCK, grading));
};

const replaceCourseReports = (cwd: string, reports: string): void => {
  const coursePath = path.join(cwd, COURSE_FILE);
  const content = fs.readFileSync(coursePath, "utf8");

  fs.writeFileSync(
    coursePath,
    content.replace(
      `reports:
  formats:
    - markdown
`,
      reports
    )
  );
};

const appendAssignmentGrading = (cwd: string, grading: string): void => {
  fs.appendFileSync(path.join(cwd, ASSIGNMENT_CONFIG_FILE), `\n${grading}`);
};

const writeWorkflow = (cwd: string, workflowPath: string, content: string): void => {
  const absolutePath = path.join(cwd, workflowPath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
};

const removeWorkflow = (cwd: string, workflowPath: string): void => {
  fs.rmSync(path.join(cwd, workflowPath), { force: true });
};

const createTemplateWorkflowFile = (content: string) => ({
  owner: ORGANIZATION,
  repo: TEMPLATE_REPO,
  path: CONFIGURED_WORKFLOW_FILE,
  content,
  message: "Seed template workflow",
  commitSha: TEMPLATE_WORKFLOW_COMMIT_SHA,
  branch: TEMPLATE_BRANCH
});

const runValidate = (cwd: string) =>
  runValidateCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options,
    githubClient: createReadyClient()
  });

const runValidateWithClient = (cwd: string, githubClient: FakeGitHubClient) =>
  runValidateCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options,
    githubClient
  });

describe("validate workflow compatibility", () => {
  it("validates preset assignments with a generated workflow containing workflow_dispatch", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    writeWorkflow(cwd, GENERATED_WORKFLOW_FILE, LIST_STYLE_DISPATCH_WORKFLOW);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).toEqual([]);
  });

  it("validates custom-workflow assignments with workflow_dispatch", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, CUSTOM_WORKFLOW_GRADING_BLOCK);
    writeWorkflow(cwd, CONFIGURED_WORKFLOW_FILE, LIST_STYLE_DISPATCH_WORKFLOW);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).toEqual([]);
  });

  it("validates contract-only assignments with object-style workflow_dispatch", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, CONTRACT_ONLY_GRADING_BLOCK);
    writeWorkflow(cwd, CONFIGURED_WORKFLOW_FILE, OBJECT_STYLE_DISPATCH_WORKFLOW);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).toEqual([]);
  });

  it("preserves legacy enabled grading configs when workflow_dispatch is present", async () => {
    const cwd = copyFixtureToTemp();
    writeWorkflow(cwd, LEGACY_WORKFLOW_FILE, LIST_STYLE_DISPATCH_WORKFLOW);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).toEqual([]);
  });

  it("supports legacy grade.yml config when the workflow exists under .github/workflows", async () => {
    const cwd = copyFixtureToTemp();
    removeWorkflow(cwd, LEGACY_WORKFLOW_FILE);
    writeWorkflow(cwd, CONFIGURED_WORKFLOW_FILE, LIST_STYLE_DISPATCH_WORKFLOW);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).toEqual([]);
  });

  it("does not require workflow, artifact, or result_file for no-grading assignments", async () => {
    const cwd = copyFixtureToTemp();
    appendAssignmentGrading(cwd, DISABLED_ASSIGNMENT_GRADING_BLOCK);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).toEqual([]);
  });

  it("accepts explicit no-grading mode with valid report publishing config", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseReports(cwd, REPORT_PUBLISHING_BLOCK);
    appendAssignmentGrading(cwd, EXPLICIT_DISABLED_ASSIGNMENT_GRADING_BLOCK);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).toEqual([]);
  });

  it("fails when enabled grading omits workflow path", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, MISSING_WORKFLOW_PATH_GRADING_BLOCK);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([expect.objectContaining({ code: "missing_grading_workflow" })]);
  });

  it("fails when the configured workflow file is missing", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, CUSTOM_WORKFLOW_GRADING_BLOCK);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors[0]?.code).toBe("grading_workflow_missing");
    expect(result.errors[0]?.context).toEqual(
      expect.objectContaining({
        workflow: CONFIGURED_WORKFLOW_FILE,
        checkedPaths: [CONFIGURED_WORKFLOW_FILE]
      })
    );
    expect(result.errors[0]?.context?.checkedPaths).not.toEqual([LEGACY_WORKFLOW_FILE]);
  });

  it("validates repository template workflows through the full contents path", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, CUSTOM_WORKFLOW_GRADING_BLOCK);
    const githubClient = createReadyClient([
      createTemplateWorkflowFile(LIST_STYLE_DISPATCH_WORKFLOW)
    ]);
    const result = await runValidateWithClient(cwd, githubClient);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).toEqual([]);
    expect(githubClient.fileReads).toEqual([
      {
        owner: ORGANIZATION,
        repo: TEMPLATE_REPO,
        path: CONFIGURED_WORKFLOW_FILE,
        ref: TEMPLATE_BRANCH
      }
    ]);
  });

  it("reports missing repository template workflows with the full configured path", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, CUSTOM_WORKFLOW_GRADING_BLOCK);
    const githubClient = createReadyClient();
    const result = await runValidateWithClient(cwd, githubClient);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors[0]?.code).toBe("grading_workflow_missing");
    expect(result.errors[0]?.context).toEqual(
      expect.objectContaining({
        workflow: CONFIGURED_WORKFLOW_FILE,
        checkedPaths: [CONFIGURED_WORKFLOW_FILE],
        templateRepository: `${ORGANIZATION}/${TEMPLATE_REPO}`,
        templateBranch: TEMPLATE_BRANCH
      })
    );
    expect(result.errors[0]?.context?.checkedPaths).not.toEqual([LEGACY_WORKFLOW_FILE]);
    expect(githubClient.fileReads.map((read) => read.path)).toEqual([CONFIGURED_WORKFLOW_FILE]);
  });

  it("checks workflow_dispatch for repository template workflow content", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, CUSTOM_WORKFLOW_GRADING_BLOCK);
    const result = await runValidateWithClient(
      cwd,
      createReadyClient([createTemplateWorkflowFile(NO_DISPATCH_WORKFLOW)])
    );

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors[0]?.code).toBe("workflow_dispatch_unsupported");
    expect(result.errors[0]?.context).toEqual(
      expect.objectContaining({
        workflow: CONFIGURED_WORKFLOW_FILE
      })
    );
  });

  it("fails when the configured workflow lacks workflow_dispatch", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, CUSTOM_WORKFLOW_GRADING_BLOCK);
    writeWorkflow(cwd, CONFIGURED_WORKFLOW_FILE, NO_DISPATCH_WORKFLOW);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "workflow_dispatch_unsupported" })
    ]);
  });

  it("fails when enabled grading omits artifact", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, MISSING_ARTIFACT_GRADING_BLOCK);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([expect.objectContaining({ code: "missing_grading_artifact" })]);
  });

  it("fails when enabled grading omits result_file", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, MISSING_RESULT_FILE_GRADING_BLOCK);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "missing_grading_result_file" })
    ]);
  });

  it("does not hard-fail custom workflows solely for lacking upload-artifact", async () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, CUSTOM_WORKFLOW_GRADING_BLOCK);
    writeWorkflow(cwd, CONFIGURED_WORKFLOW_FILE, OBJECT_STYLE_DISPATCH_WORKFLOW);
    const result = await runValidate(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).toEqual([]);
  });
});
