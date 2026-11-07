import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse, parseDocument } from "yaml";
import { runWorkflowGenerateCommand } from "../../src/cli/commands/workflow.command.js";
import { formatCommandResultAsJson, formatCommandResultAsText } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/config");
const TEMP_FIXTURE_PREFIX = "graider-workflow-generate-";
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const COURSE_FILE = "course.yml";
const ASSIGNMENT_CONFIG_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const DEFAULT_WORKFLOW_FILE = "terms/27s1/generated-workflows/lab04/grade.yml";
const EXPLICIT_WORKFLOW_FILE = "custom-output/grade.yml";
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
const UNSUPPORTED_PRESET_GRADING_BLOCK = `grading:
  enabled: true
  mode: preset
  preset: python-pytest
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`;
const MISSING_PRESET_GRADING_BLOCK = `grading:
  enabled: true
  mode: preset
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`;
const DISABLED_ASSIGNMENT_GRADING_BLOCK = `grading:
  enabled: false
`;

interface JsonCommandResult {
  readonly commandName: string;
  readonly assignmentFile: string;
  readonly status: string;
  readonly exitCode: number;
  readonly warnings: Array<{ readonly code: string }>;
  readonly errors: Array<{ readonly code: string }>;
  readonly generatedFiles: string[];
  readonly summary: {
    readonly preset?: string;
    readonly workflowFile?: string;
  };
}

const defaultOptions = normalizeCommonCommandOptions({});

const copyFixtureToTemp = (): string => {
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_FIXTURE_PREFIX));
  fs.cpSync(path.join(FIXTURE_ROOT, "valid-course"), destinationRoot, { recursive: true });
  return destinationRoot;
};

const replaceCourseGrading = (cwd: string, grading: string): void => {
  const coursePath = path.join(cwd, COURSE_FILE);
  const content = fs.readFileSync(coursePath, "utf8");

  fs.writeFileSync(coursePath, content.replace(LEGACY_COURSE_GRADING_BLOCK, grading));
};

const appendAssignmentGrading = (cwd: string, grading: string): void => {
  fs.appendFileSync(path.join(cwd, ASSIGNMENT_CONFIG_FILE), `\n${grading}`);
};

const runWorkflowGenerate = (
  cwd: string,
  options: {
    readonly json?: boolean;
    readonly output?: string;
    readonly force?: boolean;
  } = {}
) =>
  runWorkflowGenerateCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options: normalizeCommonCommandOptions(
      options.json === undefined ? {} : { json: options.json }
    ),
    force: options.force ?? false,
    ...(options.output === undefined ? {} : { output: options.output })
  });

const readGeneratedWorkflow = (cwd: string, generatedFile = DEFAULT_WORKFLOW_FILE): string =>
  fs.readFileSync(path.join(cwd, generatedFile), "utf8");

describe("graider workflow generate command", () => {
  it("generates the shell-based managed workflow", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    const result = runWorkflowGenerate(cwd);
    const workflow = readGeneratedWorkflow(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(parseDocument(workflow).errors).toEqual([]);
    expect(result.generatedFiles).toEqual([DEFAULT_WORKFLOW_FILE]);
    expect(result.summary).toMatchObject({
      preset: "java-junit-checkstyle",
      workflowFile: DEFAULT_WORKFLOW_FILE
    });
    const text = formatCommandResultAsText(result);
    expect(text).toContain("workflow generate");
    expect(text).toContain(`generated: ${DEFAULT_WORKFLOW_FILE}`);
    expect(workflow).toContain("# Managed by Graider");
    expect(workflow).toContain("# graider-workflow-version: 1");
    expect(workflow.split("# Managed by Graider")).toHaveLength(2);
    expect(parse(workflow)).toMatchObject({
      name: "AutoGrading Tests",
      on: { push: {}, workflow_dispatch: {} },
      permissions: { contents: "read", actions: "read" },
      jobs: {
        "run-autograding-tests": {
          env: { JUNIT_PLATFORM_CONSOLE_VERSION: "6.1.2" },
          steps: expect.arrayContaining([
            expect.objectContaining({
              name: "Set final grading status",
              env: { RESULT_OUTPUT_PATH: "graider-output/grading-results.json" }
            })
          ]) as unknown
        }
      }
    });
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("uses: actions/setup-java@v6");
    expect(workflow).toContain("checkstyle/checkstyle/releases/download/checkstyle-");
    expect(workflow).toContain("- name: Detect JavaFX requirements");
    expect(workflow).toContain("GRAIDER_JAVAFX_REQUIRED=%s");
    expect(workflow).toContain("JavaFX required: no");
    expect(workflow).toContain("- name: Download core grading tools");
    expect(workflow).toContain("- name: Download JavaFX modules");
    expect(workflow).toContain("if: env.GRAIDER_JAVAFX_REQUIRED == 'true'");
    expect(workflow).toContain("- name: CheckStyle");
    expect(workflow).toContain("- name: Compile Java sources");
    expect(workflow).toContain("JAVAFX_COMPILE_ARGS=()");
    expect(workflow).toContain("- name: Stage FXML resources");
    expect(workflow).toContain('relative_path="${fxml_file#src/}"');
    expect(workflow).toContain("- name: Unit Tests");
    expect(workflow).toContain("JUNIT_COMMAND=(java)");
    expect(workflow).toContain('JUNIT_COMMAND=(xvfb-run -a -s "-screen 0 1280x1024x24" java)');
    expect(workflow).toContain("grading-evidence/checkstyle.xml");
    expect(workflow).toContain("grading-evidence/");
    expect(workflow).not.toContain("classroom-resources/");
    expect(workflow).not.toContain("repo.maven.apache.org/maven2/org/testfx/");
  });

  it("emits JSON output with generated file path", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    const result = runWorkflowGenerate(cwd, { json: true });
    const json = JSON.parse(formatCommandResultAsJson(result)) as JsonCommandResult;

    expect(json.commandName).toBe("workflow generate");
    expect(json.assignmentFile).toBe(ASSIGNMENT_FILE);
    expect(json.status).toBe("success");
    expect(json.exitCode).toBe(ExitCode.Success);
    expect(json.generatedFiles).toEqual([DEFAULT_WORKFLOW_FILE]);
    expect(json.summary).toMatchObject({
      preset: "java-junit-checkstyle",
      workflowFile: DEFAULT_WORKFLOW_FILE
    });
  });

  it("uses configured artifact and result paths for grading evidence", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(
      cwd,
      PRESET_GRADING_BLOCK.replace("artifact: grading-results", "artifact: custom-results").replace(
        "result_file: grading-results.json",
        "result_file: custom output/result.json"
      )
    );
    const result = runWorkflowGenerate(cwd);
    const workflow = readGeneratedWorkflow(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(parseDocument(workflow).errors).toEqual([]);
    expect(parse(workflow)).toMatchObject({
      jobs: {
        "run-autograding-tests": {
          steps: expect.arrayContaining([
            expect.objectContaining({
              name: "Write Graider grading result and evidence metadata",
              env: expect.objectContaining({
                RESULT_OUTPUT_PATH: "custom output/result.json"
              }) as unknown
            }),
            expect.objectContaining({
              name: "Upload Graider grading result",
              with: {
                name: "custom-results",
                path: "custom output/result.json\ngrading-evidence/\n",
                "if-no-files-found": "error"
              }
            }),
            expect.objectContaining({
              name: "Set final grading status",
              env: { RESULT_OUTPUT_PATH: "custom output/result.json" }
            })
          ]) as unknown
        }
      }
    });
  });

  it("--output writes to the requested local path", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    const result = runWorkflowGenerate(cwd, { output: EXPLICIT_WORKFLOW_FILE });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.generatedFiles).toEqual([EXPLICIT_WORKFLOW_FILE]);
    expect(fs.existsSync(path.join(cwd, EXPLICIT_WORKFLOW_FILE))).toBe(true);
  });

  it("fails when the target workflow already exists without --force", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    runWorkflowGenerate(cwd);
    const result = runWorkflowGenerate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([expect.objectContaining({ code: "generated_workflow_exists" })]);
  });

  it("--force overwrites an existing workflow", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    runWorkflowGenerate(cwd);
    fs.writeFileSync(path.join(cwd, DEFAULT_WORKFLOW_FILE), "old workflow");
    const result = runWorkflowGenerate(cwd, { force: true });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(readGeneratedWorkflow(cwd)).toContain("name: AutoGrading Tests");
  });

  it("fails clearly when grading is disabled", () => {
    const cwd = copyFixtureToTemp();
    appendAssignmentGrading(cwd, DISABLED_ASSIGNMENT_GRADING_BLOCK);
    const result = runWorkflowGenerate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "workflow_generation_not_configured" })
    ]);
    expect(result.generatedFiles).toEqual([]);
    expect(fs.existsSync(path.join(cwd, DEFAULT_WORKFLOW_FILE))).toBe(false);
  });

  it("fails clearly when grading mode is not preset", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, CUSTOM_WORKFLOW_GRADING_BLOCK);
    const result = runWorkflowGenerate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "workflow_generation_requires_preset_mode" })
    ]);
  });

  it("fails through config validation when preset is missing", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, MISSING_PRESET_GRADING_BLOCK);
    const result = runWorkflowGenerate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([expect.objectContaining({ code: "missing_grading_preset" })]);
  });

  it("fails through config validation when preset is unsupported", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, UNSUPPORTED_PRESET_GRADING_BLOCK);
    const result = runWorkflowGenerate(cwd);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "unsupported_grading_preset" })
    ]);
  });

  it("does not embed GitHub credentials in generated output", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    const fakeGraiderToken = "fake-graider-workflow-token";
    const fakeGitHubToken = "fake-github-workflow-token";
    vi.stubEnv("GRAIDER_GITHUB_TOKEN", fakeGraiderToken);
    vi.stubEnv("GITHUB_TOKEN", fakeGitHubToken);

    try {
      const result = runWorkflowGenerate(cwd);
      expect(result.exitCode).toBe(ExitCode.Success);
      for (const output of [
        readGeneratedWorkflow(cwd),
        formatCommandResultAsJson(result),
        formatCommandResultAsText(result)
      ]) {
        expect(output).not.toContain(fakeGraiderToken);
        expect(output).not.toContain(fakeGitHubToken);
        expect(output).not.toMatch(/GRAIDER_GITHUB_TOKEN|GITHUB_TOKEN|authorization:/i);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not require GitHub credentials", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    const originalGraiderToken = process.env.GRAIDER_GITHUB_TOKEN;
    const originalGitHubToken = process.env.GITHUB_TOKEN;

    delete process.env.GRAIDER_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    try {
      const result = runWorkflowGenerate(cwd);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.errors).toEqual([]);
    } finally {
      if (originalGraiderToken !== undefined) {
        process.env.GRAIDER_GITHUB_TOKEN = originalGraiderToken;
      }

      if (originalGitHubToken !== undefined) {
        process.env.GITHUB_TOKEN = originalGitHubToken;
      }
    }
  });

  it("preserves existing config validation failures", () => {
    const result = runWorkflowGenerate(path.join(FIXTURE_ROOT, "missing-course-yml"));

    expect(result.exitCode).toBe(ExitCode.ConfigurationOrSchemaError);
    expect(result.errors).toEqual([expect.objectContaining({ code: "missing_required_file" })]);
  });

  it("keeps default options stable", () => {
    expect(defaultOptions).toMatchObject({
      json: false,
      verbose: false,
      yes: false
    });
  });
});
