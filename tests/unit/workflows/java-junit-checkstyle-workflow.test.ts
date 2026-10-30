import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { renderJavaJunitCheckstyleWorkflow } from "../../../src/workflows/java-junit-checkstyle-workflow.js";

const FINAL_GRADING_STEP_COUNT = 3;

const grading = {
  enabled: true,
  mode: "preset",
  preset: "java-junit-checkstyle",
  workflow: ".github/workflows/grade.yml",
  artifact: "grading-results",
  result_file: "grading-results.json"
} as const;

interface GeneratedWorkflowStep {
  readonly name?: string;
  readonly if?: string;
  readonly run?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly "continue-on-error"?: boolean;
}

interface GeneratedWorkflowDocument {
  readonly jobs: {
    readonly "run-autograding-tests": {
      readonly steps: readonly GeneratedWorkflowStep[];
    };
  };
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const workflowDocument = (workflow: string): GeneratedWorkflowDocument =>
  parse(workflow) as GeneratedWorkflowDocument;

const workflowStep = (workflow: string, name: string): GeneratedWorkflowStep => {
  const step = workflowDocument(workflow).jobs["run-autograding-tests"].steps.find(
    (candidate) => candidate.name === name
  );

  if (step === undefined) throw new Error(`Generated workflow step not found: ${name}`);
  return step;
};

const stepScript = (workflow: string, name: string): string => {
  const script = workflowStep(workflow, name).run;

  if (script === undefined) throw new Error(`Generated workflow step has no script: ${name}`);
  return script;
};

const createTemporaryRepository = (): string => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "graider-javafx-workflow-"));
  temporaryDirectories.push(repository);
  return repository;
};

const writeRepositoryFile = (repository: string, relativePath: string, content: string): void => {
  const filePath = path.join(repository, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const runBashStep = (
  script: string,
  repository: string,
  environment: Readonly<Record<string, string>>
): string =>
  execFileSync("bash", ["-c", script], {
    cwd: repository,
    env: { ...process.env, ...environment },
    encoding: "utf8"
  });

describe("java-junit-checkstyle workflow", () => {
  it("preserves the managed Java grading and evidence invariants", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });

    expect(workflow).toContain("# Managed by Graider");
    expect(workflow).toContain("# graider-workflow-version: 1");
    expect(workflow).not.toContain("classroom-resources/autograding-command-grader");
    expect(workflow).not.toContain("classroom-resources/autograding-grading-reporter");
    expect(workflow).not.toContain("runners:");
    expect(workflow).toContain("runs-on: ubuntu-24.04");
    expect(workflow).toContain("uses: actions/setup-java@v6");
    expect(workflow).toContain("distribution: temurin");
    expect(workflow).toContain('JAVA_VERSION: "25"');
    expect(workflow).toContain('JAVAFX_VERSION: "25.0.2"');
    expect(workflow).toContain('CHECKSTYLE_VERSION: "14.1.0"');
    expect(workflow).toContain(
      'CHECKSTYLE_CONFIG_URL: "https://csse.msoe.us/csc1110/MSOE_checkStyle.xml"'
    );
    expect(workflow).toContain("checkstyle/checkstyle/releases/download/checkstyle-");
    expect(workflow).toContain(
      "junit-platform-console-standalone/${JUNIT_PLATFORM_CONSOLE_VERSION}"
    );
    expect(workflow).toContain("mockito-core/${MOCKITO_VERSION}");
    expect(workflow).toContain("byte-buddy-agent/${BYTE_BUDDY_VERSION}");
    expect(workflow).toContain("objenesis/${OBJENESIS_VERSION}");
    expect(workflow).toContain('download "$CHECKSTYLE_CONFIG_URL" "$TOOLS_DIR/checkstyle.xml"');
    expect(workflow).toContain("- name: CheckStyle");
    expect(workflow).toContain("- name: Compile Java sources");
    expect(workflow).toContain("- name: Unit Tests");
    expect(workflow).toContain("SOURCE_ROOTS=()");
    expect(workflow).toContain("if [[ -d test ]]; then SOURCE_ROOTS+=(test); fi");
    expect(workflow).toContain("if [[ -d tests ]]; then SOURCE_ROOTS+=(tests); fi");
    expect(workflow).not.toContain("find src test");
    expect(workflow).toContain("REPOSITORY_JARS=()");
    expect(workflow).toContain("find lib -type f -name '*.jar' -print0");
    expect(workflow).not.toContain("repo.maven.apache.org/maven2/org/testfx/");
    expect(workflow).toContain('"$EVIDENCE_DIR/checkstyle.xml"');
    expect(workflow).toContain('"$EVIDENCE_DIR/junit"');
    expect(workflow).toContain("metadata.json");
    expect(workflow).toContain("graider-output/grading-results.json");
    expect(workflow).toContain("grading-evidence/");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("submission_sha:");
    expect(workflow).toContain("${{ inputs.submission_sha || github.sha }}");
    expect(workflow).toContain("ref: ${{ env.EFFECTIVE_SUBMISSION_SHA }}");
    expect(workflow).toContain("SUBMISSION_COMMIT_SHA: ${{ env.EFFECTIVE_SUBMISSION_SHA }}");
    expect(workflow).toContain('COMMIT_MSG=$(git log -1 --pretty=%s "$EFFECTIVE_SUBMISSION_SHA")');
    expect(workflow).not.toContain('COMMIT_MSG=$(git log -1 --pretty=%s "$GITHUB_SHA")');
    expect(workflow).toContain("find \"$BUILD_DIR\" -type f -name '*.class' -print0");
    expect(workflow).toContain("org/junit/jupiter/api/Tag(s)?");
    expect(workflow).toContain('if [[ "$JUNIT_TAGS_PRESENT" == true ]]; then');
    expect(workflow).toContain("COMMIT[0-9]*|DONE[0-9]*)");
    expect(workflow).toContain('TAG_ARGS=(--include-tag "$TAG")');
    expect(workflow).toContain('"${TAG_ARGS[@]}" --scan-class-path');
    expect(workflow).toContain('--reports-dir "$EVIDENCE_DIR/junit"');
    expect(workflow).toContain("github.actor != 'github-classroom[bot]'");
    expect(workflow).toContain("github.event.before == '0000000000000000000000000000000000000000'");
    expect(workflow).toContain("github.ref_name == github.event.repository.default_branch");
    expect(workflow).toContain("paths-ignore:");
    expect(workflow).toContain("- .github/workflows/grade.yml");
    expect(workflow).toContain("uses: actions/upload-artifact@v4");
    expect(workflow).toContain("if: always()");
    expect(workflow).not.toContain("repository_dispatch");
  });

  it("uploads evidence before the unconditional final result gate", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });
    const steps = workflowDocument(workflow).jobs["run-autograding-tests"].steps;
    for (const name of ["CheckStyle", "Compile Java sources", "Unit Tests"]) {
      expect(workflowStep(workflow, name)["continue-on-error"]).toBe(true);
    }
    const writer = workflowStep(workflow, "Write Graider grading result and evidence metadata");
    const upload = workflowStep(workflow, "Upload Graider grading result");
    const gate = workflowStep(workflow, "Set final grading status");
    expect(writer.if).toBe("always()");
    expect(upload.if).toBe("always()");
    expect(gate.if).toBe("always()");
    expect(steps.slice(-FINAL_GRADING_STEP_COUNT)).toEqual([writer, upload, gate]);
    expect(gate.env?.RESULT_OUTPUT_PATH).toBe(writer.env?.RESULT_OUTPUT_PATH);
    expect(gate.run).toContain('os.environ["RESULT_OUTPUT_PATH"]');
    expect(gate.run).not.toMatch(/steps\.|CHECKSTYLE_OUTCOME|COMPILE_OUTCOME|UNIT_TESTS_OUTCOME/);
    expect(writer.env).toMatchObject({
      CHECKSTYLE_OUTCOME: "${{ steps.checkstyle.outcome }}",
      COMPILE_OUTCOME: "${{ steps.compile.outcome }}",
      UNIT_TESTS_OUTCOME: "${{ steps.unittests.outcome }}"
    });
    expect(workflow).not.toContain(".conclusion");
  });

  it.each([
    ["passed", '{"schema_version":1,"status":"passed"}', true],
    ["failed", '{"schema_version":1,"status":"failed"}', false],
    ["missing", undefined, false],
    ["empty", "", false],
    ["malformed", "{", false],
    ["array", "[]", false],
    ["null", "null", false],
    ["scalar", '"passed"', false],
    ["missing status", '{"schema_version":1}', false],
    ["unsupported status", '{"schema_version":1,"status":"skipped"}', false],
    ["wrong status type", '{"schema_version":1,"status":[]}', false],
    ["missing version", '{"status":"passed"}', false],
    ["future version", '{"schema_version":2,"status":"passed"}', false],
    ["boolean version", '{"schema_version":true,"status":"passed"}', false]
  ])("gates a %s result safely", (_name, content, succeeds) => {
    const workflow = renderJavaJunitCheckstyleWorkflow({
      grading: { ...grading, result_file: "custom output/result.json" }
    });
    const repository = createTemporaryRepository();
    const gate = workflowStep(workflow, "Set final grading status");
    const resultPath = gate.env?.RESULT_OUTPUT_PATH ?? "";
    if (content !== undefined) writeRepositoryFile(repository, resultPath, content);
    const execution = spawnSync("bash", ["-e", "-o", "pipefail", "-c", gate.run ?? ""], {
      cwd: repository,
      env: { ...process.env, ...gate.env },
      encoding: "utf8"
    });
    expect(execution.error).toBeUndefined();
    expect(execution.status).toBe(succeeds ? 0 : 1);
    if (!succeeds) expect(execution.stdout).toContain("::error::");
    expect(execution.stderr).toBe("");
  });

  it.each([
    ["success", "success", "success", "passed"],
    ["failure", "success", "success", "failed"],
    ["success", "failure", "skipped", "failed"],
    ["success", "success", "failure", "failed"],
    ["failure", "failure", "failure", "failed"]
  ])("records and gates outcomes %s/%s/%s as %s", (checkstyle, compile, junit, status) => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });
    const repository = createTemporaryRepository();
    const writer = workflowStep(workflow, "Write Graider grading result and evidence metadata");
    const gate = workflowStep(workflow, "Set final grading status");
    const resultPath = writer.env?.RESULT_OUTPUT_PATH ?? "";
    const environment = {
      CHECKSTYLE_OUTCOME: checkstyle,
      COMPILE_OUTCOME: compile,
      UNIT_TESTS_OUTCOME: junit,
      SUBMISSION_COMMIT_SHA: "submission-sha",
      WORKFLOW_RUN_ID: "123",
      WORKFLOW_RUN_ATTEMPT: "1",
      RESULT_OUTPUT_PATH: resultPath,
      OUTPUT_DIR: path.join(repository, "graider-output"),
      EVIDENCE_DIR: path.join(repository, "grading-evidence")
    };
    runBashStep(writer.run ?? "", repository, environment);
    expect(JSON.parse(fs.readFileSync(path.join(repository, resultPath), "utf8"))).toMatchObject({
      schema_version: 1,
      status,
      checks: [
        { name: "CheckStyle", status: checkstyle === "success" ? "passed" : "failed" },
        {
          name: "Unit Tests",
          status: compile === "success" && junit === "success" ? "passed" : "failed"
        }
      ]
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(environment.EVIDENCE_DIR, "metadata.json"), "utf8"))
    ).toMatchObject({
      compile: { outcome: compile },
      junit: { outcome: junit },
      checkstyle: { outcome: checkstyle }
    });
    const execution = spawnSync("bash", ["-c", gate.run ?? ""], {
      cwd: repository,
      env: { ...process.env, ...gate.env },
      encoding: "utf8"
    });
    expect(execution.status).toBe(status === "passed" ? 0 : 1);
  });

  it("makes every JavaFX-specific setup and execution path conditional", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });
    const steps = workflowDocument(workflow).jobs["run-autograding-tests"].steps;
    const coreDownload = workflowStep(workflow, "Download core grading tools");
    const dependencyInstall = workflowStep(workflow, "Install headless JavaFX dependencies");
    const javafxDownload = workflowStep(workflow, "Download JavaFX modules");
    const fxmlStaging = workflowStep(workflow, "Stage FXML resources");
    const unitTests = workflowStep(workflow, "Unit Tests");
    const compileScript = stepScript(workflow, "Compile Java sources");
    const unitTestScript = stepScript(workflow, "Unit Tests");

    expect(steps.findIndex((step) => step.name === "Detect JavaFX requirements")).toBe(
      steps.findIndex((step) => step.name === "Check out repository") + 1
    );
    expect(coreDownload.if).toBeUndefined();
    expect(coreDownload.run).not.toContain("org/openjfx/javafx-");
    expect(dependencyInstall.if).toBe("env.GRAIDER_JAVAFX_REQUIRED == 'true'");
    expect(dependencyInstall.run).toContain("xvfb libgtk-3-0t64 libasound2t64");
    expect(javafxDownload.if).toBe("env.GRAIDER_JAVAFX_REQUIRED == 'true'");
    expect(javafxDownload.run).toContain("org/openjfx/javafx-");
    expect(javafxDownload.run).toContain("base graphics controls fxml swing");
    expect(javafxDownload.run).toContain('"$JAVAFX_LIB/javafx-swing.jar"');
    expect(fxmlStaging.if).toBe(
      "steps.compile.outcome == 'success' && env.GRAIDER_JAVAFX_REQUIRED == 'true'"
    );
    expect(unitTests.if).toBe(
      "always() && steps.compile.outcome == 'success' && (env.GRAIDER_JAVAFX_REQUIRED != 'true' || steps.fxml.outcome == 'success')"
    );
    expect(compileScript).toContain("JAVAFX_COMPILE_ARGS=()");
    expect(compileScript).toContain('if [[ "$GRAIDER_JAVAFX_REQUIRED" == true ]]');
    expect(compileScript).toContain(
      'JAVAFX_COMPILE_ARGS=(--module-path "$JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml,javafx.swing)'
    );
    expect(compileScript).toContain('javac "${JAVAFX_COMPILE_ARGS[@]}" -cp "$CLASSPATH"');
    expect(unitTestScript).toContain("JUNIT_COMMAND=(java)");
    expect(unitTestScript).toContain(
      'JUNIT_COMMAND=(xvfb-run -a -s "-screen 0 1280x1024x24" java)'
    );
    expect(unitTestScript).toContain("JAVAFX_RUNTIME_ARGS=()");
    expect(unitTestScript).toContain(
      'JAVAFX_RUNTIME_ARGS=(-Dprism.order=sw --module-path "$JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml,javafx.swing)'
    );
    expect(unitTestScript).toContain('"${JUNIT_COMMAND[@]}" "${JAVAFX_RUNTIME_ARGS[@]}" -jar');
  });

  it("renders syntactically valid Bash for every shell step", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });
    const scripts = workflowDocument(workflow).jobs["run-autograding-tests"].steps.flatMap(
      (step) => (step.run === undefined ? [] : [step.run])
    );

    for (const script of scripts) {
      expect(() => execFileSync("bash", ["-n", "-c", script])).not.toThrow();
    }
  });

  it.each([
    {
      name: "plain Java",
      files: { "src/example/App.java": "package example; public class App {}\n" },
      required: false,
      reason: "Using standard Java/JUnit environment."
    },
    {
      name: "FXML under src",
      files: { "src/jones/Main.fxml": "<AnchorPane/>\n" },
      required: true,
      reason: "Reason: FXML resources found under src/"
    },
    {
      name: "JavaFX import under src",
      files: { "src/jones/App.java": "import javafx.application.Application;\nclass App {}\n" },
      required: true,
      reason: "Reason: JavaFX imports found"
    },
    {
      name: "TestFX import under tests",
      files: {
        "tests/jones/AppTest.java": "import org.testfx.framework.junit5.ApplicationTest;\n"
      },
      required: true,
      reason: "Reason: TestFX imports found"
    },
    {
      name: "qualified JavaFX reference under test",
      files: { "test/AppTest.java": "class AppTest { javafx.scene.Node node; }\n" },
      required: true,
      reason: "Reason: JavaFX package references found"
    },
    {
      name: "SwingFXUtils reference under test",
      files: {
        "test/ImageTest.java": "class ImageTest { javafx.embed.swing.SwingFXUtils utils; }\n"
      },
      required: true,
      reason: "Reason: JavaFX package references found"
    },
    {
      name: "JavaFX module requirements",
      files: {
        "src/module-info.java":
          "module app { requires javafx.controls; requires transitive javafx.fxml; requires static javafx.graphics; }\n"
      },
      required: true,
      reason: "Reason: JavaFX module requirements found"
    }
  ])("detects $name from the checked-out source tree", ({ files, required, reason }) => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });
    const repository = createTemporaryRepository();
    const githubEnvironment = path.join(repository, "github-environment");

    for (const [relativePath, content] of Object.entries(files)) {
      writeRepositoryFile(repository, relativePath, content);
    }

    const output = runBashStep(stepScript(workflow, "Detect JavaFX requirements"), repository, {
      GITHUB_ENV: githubEnvironment
    });

    expect(output).toContain(`JavaFX required: ${required ? "yes" : "no"}`);
    expect(output).toContain(reason);
    expect(fs.readFileSync(githubEnvironment, "utf8")).toBe(
      `GRAIDER_JAVAFX_REQUIRED=${String(required)}\n`
    );
  });

  it("recognizes each supported JavaFX module requirement modifier form", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });

    for (const declaration of [
      "requires javafx.controls;",
      "requires javafx.fxml;",
      "requires transitive javafx.controls;",
      "requires static javafx.graphics;"
    ]) {
      const repository = createTemporaryRepository();
      const githubEnvironment = path.join(repository, "github-environment");
      writeRepositoryFile(
        repository,
        "src/module-info.java",
        `module app {\n  ${declaration}\n}\n`
      );

      const output = runBashStep(stepScript(workflow, "Detect JavaFX requirements"), repository, {
        GITHUB_ENV: githubEnvironment
      });

      expect(output).toContain("Reason: JavaFX module requirements found");
      expect(fs.readFileSync(githubEnvironment, "utf8")).toBe("GRAIDER_JAVAFX_REQUIRED=true\n");
    }
  });

  it("stages top-level and nested FXML with paths relative to src", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });
    const repository = createTemporaryRepository();
    const buildDirectory = path.join(repository, ".graider-build");
    writeRepositoryFile(repository, "src/jones/Main.fxml", "main fxml\n");
    writeRepositoryFile(repository, "src/jones/views/Main.fxml", "nested fxml\n");
    writeRepositoryFile(repository, "src/jones/ignored.txt", "not a resource\n");

    const output = runBashStep(stepScript(workflow, "Stage FXML resources"), repository, {
      BUILD_DIR: buildDirectory
    });

    expect(fs.readFileSync(path.join(buildDirectory, "jones/Main.fxml"), "utf8")).toBe(
      "main fxml\n"
    );
    expect(fs.readFileSync(path.join(buildDirectory, "jones/views/Main.fxml"), "utf8")).toBe(
      "nested fxml\n"
    );
    expect(fs.existsSync(path.join(buildDirectory, "jones/ignored.txt"))).toBe(false);
    expect(output).toContain("src/jones/Main.fxml ->");
    expect(output).toContain("src/jones/views/Main.fxml ->");
  });

  it("treats zero FXML files as a harmless staging no-op", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });
    const repository = createTemporaryRepository();
    const buildDirectory = path.join(repository, ".graider-build");
    writeRepositoryFile(repository, "src/jones/App.java", "package jones; class App {}\n");

    expect(() =>
      runBashStep(stepScript(workflow, "Stage FXML resources"), repository, {
        BUILD_DIR: buildDirectory
      })
    ).not.toThrow();
  });

  it("substitutes only the configured artifact and result file locations", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({
      grading: { ...grading, artifact: "custom-results", result_file: "custom-result.json" }
    });

    expect(workflow).toContain("name: custom-results");
    expect(workflow).toContain("graider-output/custom-result.json");
  });
});
