/** Linux CI integration: real JavaFX, Xvfb, Robot and JUnit; no repositories or credentials. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { renderJavaJunitCheckstyleWorkflow } from "../src/workflows/java-junit-checkstyle-workflow.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-gui-"));
const tools = path.join(root, "tools");
const javafx = path.join(tools, "javafx");
const build = path.join(root, "build");
const evidence = path.join(root, "grading-evidence");
const output = path.join(root, "graider-output");
const workflow = parse(
  renderJavaJunitCheckstyleWorkflow({
    grading: {
      enabled: true,
      mode: "preset",
      preset: "java-junit-checkstyle",
      workflow: ".github/workflows/grade.yml",
      artifact: "grading-results",
      result_file: "grading-results.json"
    }
  })
) as { jobs: Record<string, { steps: { name?: string; run?: string }[] }> };
const steps = workflow.jobs["run-autograding-tests"]?.steps ?? [];
const script = (name: string): string => {
  const value = steps.find((step) => step.name === name)?.run;
  assert.ok(value, name);
  return value;
};
const env = {
  ...process.env,
  TOOLS_DIR: tools,
  JAVAFX_LIB: javafx,
  BUILD_DIR: build,
  EVIDENCE_DIR: evidence,
  OUTPUT_DIR: output,
  GRAIDER_JAVAFX_REQUIRED: "true",
  JAVAFX_VERSION: "25.0.2"
};
const run = (name: string): void => {
  execFileSync("bash", ["-e", "-c", script(name)], { cwd: root, env, stdio: "inherit" });
};
try {
  for (const directory of [tools, build, evidence, output, path.join(root, "tests")])
    fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync("tests/fixtures/gui/SmokeTest.java", path.join(root, "tests", "SmokeTest.java"));
  run("Download JavaFX modules");
  execFileSync("curl", [
    "--fail",
    "--location",
    "--silent",
    "--show-error",
    "--output",
    path.join(tools, "junit-platform-console-standalone.jar"),
    "https://repo.maven.apache.org/maven2/org/junit/platform/junit-platform-console-standalone/6.1.2/junit-platform-console-standalone-6.1.2.jar"
  ]);
  run("Prepare optional GUI smoke helper");
  run("Compile Java sources");
  for (const scenario of ["success", "hidden", "assertion", "startup", "interaction", "shutdown"]) {
    fs.rmSync(path.join(evidence, "junit"), { recursive: true, force: true });
    const execution = spawnSync("bash", ["-e", "-c", script("Unit Tests")], {
      cwd: root,
      env: { ...env, GUI_SCENARIO: scenario },
      encoding: "utf8",
      timeout: 90000
    });
    assert.ifError(execution.error);
    assert.equal(
      execution.status === 0,
      scenario === "success",
      execution.stdout + execution.stderr
    );
    const writer = spawnSync(
      "bash",
      ["-e", "-c", script("Write Graider grading result and evidence metadata")],
      {
        cwd: root,
        env: {
          ...env,
          CHECKSTYLE_OUTCOME: "success",
          COMPILE_OUTCOME: "success",
          UNIT_TESTS_OUTCOME: execution.status === 0 ? "success" : "failure",
          SUBMISSION_COMMIT_SHA: "fixture",
          WORKFLOW_RUN_ID: "1",
          WORKFLOW_RUN_ATTEMPT: "1",
          RESULT_OUTPUT_PATH: path.join(output, "grading-results.json")
        },
        encoding: "utf8"
      }
    );
    assert.equal(writer.status, 0, writer.stderr);
    const result = JSON.parse(
      fs.readFileSync(path.join(output, "grading-results.json"), "utf8")
    ) as { status: string; summary: string };
    assert.equal(result.status, scenario === "success" ? "passed" : "failed");
    assert.match(
      result.summary,
      scenario === "success" ? /GUI verified: 1/ : /GUI verification failed: 0/
    );
    console.log(`Real GUI fixture ${scenario}: ${result.summary}`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
