import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
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
  it.skip("superseded Classroom-workflow assertions", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    const result = runWorkflowGenerate(cwd);
    const workflow = readGeneratedWorkflow(cwd);
    const text = formatCommandResultAsText(result);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(parseDocument(workflow).errors).toEqual([]);
    expect(result.generatedFiles).toEqual([DEFAULT_WORKFLOW_FILE]);
    expect(result.summary).toMatchObject({
      preset: "java-junit-checkstyle",
      workflowFile: DEFAULT_WORKFLOW_FILE
    });
    expect(text).toContain("workflow generate");
    expect(text).toContain(`generated: ${DEFAULT_WORKFLOW_FILE}`);
    expect(workflow).toContain("# Managed by Graider");
    expect(workflow).toContain("# graider-workflow-version: 1");
    expect(workflow.split("# Managed by Graider")).toHaveLength(2);
    expect(workflow).toContain("name: AutoGrading Tests");
    expect(workflow).toContain("  run-autograding-tests:");
    expect(workflow).toContain("github.actor != 'github-classroom[bot]'");
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("github.event.before == '0000000000000000000000000000000000000000'");
    expect(workflow).toContain("github.ref_name == github.event.repository.default_branch");
    expect(workflow).toContain('JUNIT_PLATFORM_CONSOLE_VERSION: "6.1.2"');
    expect(workflow).toContain('CHECKSTYLE_VERSION: "14.1.0"');
    expect(workflow).toContain('JAVA_VERSION: "25"');
    expect(workflow).toContain(
      'CHECKSTYLE_CONFIG_URL: "https://csse.msoe.us/csc1110/MSOE_checkStyle.xml"'
    );
    expect(workflow).toContain(
      "org/junit/platform/junit-platform-console-standalone/${JUNIT_PLATFORM_CONSOLE_VERSION}"
    );
    expect(workflow).toContain(
      "com/puppycrawl/tools/checkstyle/${CHECKSTYLE_VERSION}/checkstyle-${CHECKSTYLE_VERSION}-all.jar"
    );
    expect(workflow).toContain('"$TOOLS_DIR/junit-platform-console-standalone.jar"');
    expect(workflow).toContain('"$TOOLS_DIR/checkstyle.jar"');
    expect(workflow).not.toContain("junit-platform-console-standalone-6.1.0.jar");
    expect(workflow).not.toContain("checkstyle-13.4.1-all.jar");
    expect(workflow).toContain("  push:");
    expect(workflow).toContain("    paths-ignore:");
    expect(workflow).toContain("      - .github/workflows/grade.yml");
    expect(workflow).not.toContain(".github/**");
    expect(workflow).not.toContain("repository_dispatch");
    expect(workflow).toContain("  workflow_dispatch:");
    expect(workflow).toContain(".graider/write-grading-result.py");
    expect(workflow).toContain("python3 .graider/write-grading-result.py");
    expect(workflow).toContain(
      "CHECKSTYLE_CLASSROOM_RESULT: ${{ steps.checkstyle.outputs.result }}"
    );
    expect(workflow).toContain(
      "UNIT_TESTS_CLASSROOM_RESULT: ${{ steps.unit-tests.outputs.result }}"
    );
    expect(workflow).toContain("CHECKSTYLE_OUTCOME: ${{ steps.checkstyle.outcome }}");
    expect(workflow).toContain("UNIT_TESTS_OUTCOME: ${{ steps.unit-tests.outcome }}");
    expect(workflow).toContain(
      '--classroom-check "CheckStyle=CHECKSTYLE_CLASSROOM_RESULT:CHECKSTYLE_OUTCOME"'
    );
    expect(workflow).toContain(
      '--classroom-check "Unit Tests=UNIT_TESTS_CLASSROOM_RESULT:UNIT_TESTS_OUTCOME"'
    );
    expect(workflow).toContain("name: grading-results");
    expect(workflow).toContain('java -jar "$TOOLS_DIR/checkstyle.jar" -c "$CHECKSTYLE_CONFIG_URL"');
    expect(workflow).toContain("COMMIT_MSG='${{ github.event.head_commit.message }}'");
    expect(workflow).toContain("COMMIT[0-9]*|DONE[0-9]*)");
    expect(workflow).toContain('TAG="${COMMIT_MSG%% *}"');
    expect(workflow).toContain('TAG_ARGS="--include-tag $TAG"');
    expect(workflow).toContain('TAG_ARGS=""');
    expect(workflow).toContain("$TAG_ARGS --scan-class-path --class-path bin");
    expect(workflow).toContain("--reports-dir grading-evidence/junit");
    expect(workflow).toContain("-f xml -o grading-evidence/checkstyle.xml");
    expect(workflow).toContain("--evidence-metadata-output grading-evidence/metadata.json");
    expect(workflow).toContain("SUBMISSION_COMMIT_SHA: ${{ github.sha }}");
    expect(workflow).toContain("WORKFLOW_RUN_ID: ${{ github.run_id }}");
    expect(workflow).toContain("WORKFLOW_RUN_ATTEMPT: ${{ github.run_attempt }}");
    expect(workflow).toContain("COMPILE_OUTCOME: ${{ steps.compile.outcome }}");
    expect(workflow).toContain('--evidence-outcome "junit=${UNIT_TESTS_OUTCOME}"');
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain("path: |");
    expect(workflow).toContain("  graider-output/grading-results.json");
    expect(workflow).toContain("  grading-evidence/");
    expect(workflow).not.toContain("path: .");
    expect(workflow).toContain("schema_version");
    expect(workflow).toContain("steps.checkstyle.outcome");
    expect(workflow).toContain("steps.unit-tests.outcome");
    expect(workflow).toContain('STATUS_PASSED = "passed"');
    expect(workflow).toContain('STATUS_FAILED = "failed"');
    expect(workflow).toContain('STATUS_SKIPPED = "skipped"');
    expect(workflow).toContain('"success": STATUS_PASSED');
    expect(workflow).toContain('"failure": STATUS_FAILED');
    expect(workflow).toContain('"cancelled": STATUS_FAILED');
    expect(workflow).toContain('"skipped": STATUS_SKIPPED');
    expect(workflow).toContain("decode_classroom_result");
    expect(workflow).toContain("status_from_classroom_or_outcome");
    expect(workflow).toContain("classroom-resources/autograding-command-grader@v1");
    expect(workflow).toContain("classroom-resources/autograding-grading-reporter@v1");
    expect(workflow).toContain("CHECKSTYLE_RESULTS: ${{ steps.checkstyle.outputs.result }}");
    expect(workflow).toContain("UNIT-TESTS_RESULTS: ${{ steps.unit-tests.outputs.result }}");
    expect(workflow).toContain("runners: checkstyle,unit-tests");
    expect(workflow).not.toContain("education/autograding@v1");
    expect(workflow).toContain("$(find src -name '*.java' -print)");
    const compileStep = workflow.slice(
      workflow.indexOf("      - name: Compile Java sources"),
      workflow.indexOf("      - name: Unit Tests")
    );
    expect(compileStep).toContain("-d bin $(find src test -name '*.java' -print)");
    expect(compileStep).not.toContain("continue-on-error");
    expect(workflow).not.toContain("actions/github-script");
    expect(workflow).not.toContain('--check "CheckStyle=${{ steps.checkstyle.outputs.result }}"');
    expect(workflow).not.toContain('--check "Unit Tests=${{ steps.unit-tests.outputs.result }}"');
    expect(workflow).not.toContain('--check "CheckStyle=${{ steps.checkstyle.outcome }}"');
    expect(workflow).not.toContain('--check "Unit Tests=${{ steps.unit-tests.outcome }}"');
    expect(workflow).not.toContain('"status": "${{ steps.checkstyle.outputs.result }}"');
    expect(workflow).not.toContain('"status": "${{ steps.unit-tests.outputs.result }}"');
    expect(workflow).not.toContain('"status": "${{ steps.checkstyle.outcome }}"');
    expect(workflow).not.toContain('"status": "${{ steps.unit-tests.outcome }}"');
    expect(workflow).not.toContain("faculty-summary");
    expect(workflow).not.toContain("GRAIDER_GITHUB_TOKEN");
  });

  it("generates the shell-based managed workflow", () => {
    const cwd = copyFixtureToTemp();
    replaceCourseGrading(cwd, PRESET_GRADING_BLOCK);
    const result = runWorkflowGenerate(cwd);
    const workflow = readGeneratedWorkflow(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(parseDocument(workflow).errors).toEqual([]);
    expect(workflow).toContain("uses: actions/setup-java@v6");
    expect(workflow).toContain("checkstyle/checkstyle/releases/download/checkstyle-");
    expect(workflow).toContain("- name: CheckStyle");
    expect(workflow).toContain("- name: Compile Java sources");
    expect(workflow).toContain("- name: Unit Tests");
    expect(workflow).toContain("xvfb-run -a");
    expect(workflow).toContain("grading-evidence/checkstyle.xml");
    expect(workflow).toContain("grading-evidence/");
    expect(workflow).not.toContain("classroom-resources/");
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
