import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rawAssignmentConfigSchema } from "../../src/config/config-schemas.js";
import { parseGradingResultsJsonText } from "../../src/grading/grading-result-validator.js";
import { parseYaml } from "../../src/io/stable-yaml.js";

const EXAMPLES_ROOT = path.resolve("examples/grading");
const JSON_EXTENSION = ".json";
const YAML_EXTENSIONS = [".yml", ".yaml"];
const EXPECTED_EXAMPLE_NAMES = [
  "java-junit-checkstyle",
  "custom-command",
  "github-classroom",
  "contract-only",
  "faculty-provided-report",
  "no-grading"
] as const;
const EMPTY_COLLECTION_SIZE = 0;
const SUPPORTED_RESULT_STATUSES = ["passed", "failed", "skipped"] as const;

type ExampleName = (typeof EXPECTED_EXAMPLE_NAMES)[number];

interface ExampleAssignment {
  grading?: {
    enabled?: boolean;
    mode?: string;
    preset?: string;
    workflow?: string;
    artifact?: string;
    result_file?: string;
  };
}

const readText = (filePath: string): string => fs.readFileSync(filePath, "utf8");

const examplePath = (exampleName: ExampleName, ...segments: string[]): string =>
  path.join(EXAMPLES_ROOT, exampleName, ...segments);

const findFiles = (directory: string, predicate: (filePath: string) => boolean): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    return entry.isDirectory()
      ? findFiles(entryPath, predicate)
      : entry.isFile() && predicate(entryPath)
        ? [entryPath]
        : [];
  });

const parseExampleYaml = (filePath: string): unknown => {
  const result = parseYaml(readText(filePath), filePath);

  expect(result.status, filePath).toBe("success");
  return result.status === "success" ? result.value : undefined;
};

const readAssignment = (exampleName: ExampleName): ExampleAssignment =>
  parseExampleYaml(examplePath(exampleName, "assignment.yml")) as ExampleAssignment;

const workflowText = (exampleName: ExampleName, workflowPath = ".github/workflows/grade.yml") =>
  readText(examplePath(exampleName, workflowPath));

describe("grading examples", () => {
  it("includes the expected example directories with README and assignment files", () => {
    expect(fs.existsSync(path.join(EXAMPLES_ROOT, "README.md"))).toBe(true);

    for (const exampleName of EXPECTED_EXAMPLE_NAMES) {
      expect(fs.existsSync(examplePath(exampleName)), exampleName).toBe(true);
      expect(fs.existsSync(examplePath(exampleName, "README.md")), exampleName).toBe(true);
      expect(fs.existsSync(examplePath(exampleName, "assignment.yml")), exampleName).toBe(true);
    }
  });

  it("parses every example YAML file", () => {
    const yamlFiles = findFiles(EXAMPLES_ROOT, (filePath) =>
      YAML_EXTENSIONS.includes(path.extname(filePath))
    );

    expect(yamlFiles.length).toBeGreaterThan(EMPTY_COLLECTION_SIZE);

    for (const yamlFile of yamlFiles) {
      parseExampleYaml(yamlFile);
    }
  });

  it("parses every example JSON file", () => {
    const jsonFiles = findFiles(EXAMPLES_ROOT, (filePath) => filePath.endsWith(JSON_EXTENSION));

    expect(jsonFiles.length).toBeGreaterThan(EMPTY_COLLECTION_SIZE);

    for (const jsonFile of jsonFiles) {
      expect(() => {
        JSON.parse(readText(jsonFile));
      }, jsonFile).not.toThrow();
    }
  });

  it("keeps example assignment files compatible with the current assignment schema", () => {
    for (const exampleName of EXPECTED_EXAMPLE_NAMES) {
      const assignment = parseExampleYaml(examplePath(exampleName, "assignment.yml"));
      const parsed = rawAssignmentConfigSchema.safeParse(assignment);

      expect(parsed.success, exampleName).toBe(true);
    }
  });

  it("keeps grading result examples inside the documented result contract", () => {
    const resultFiles = findFiles(EXAMPLES_ROOT, (filePath) =>
      filePath.endsWith("grading-results.json")
    );

    expect(resultFiles.length).toBeGreaterThan(EMPTY_COLLECTION_SIZE);

    for (const resultFile of resultFiles) {
      const result = parseGradingResultsJsonText(readText(resultFile));

      expect(result.errors, resultFile).toEqual([]);
      expect(result.result?.schemaVersion, resultFile).toBe(1);
      expect(SUPPORTED_RESULT_STATUSES).toContain(result.result?.status);
      expect(
        result.result?.checks.every((check) =>
          SUPPORTED_RESULT_STATUSES.includes(
            check.status as (typeof SUPPORTED_RESULT_STATUSES)[number]
          )
        ),
        resultFile
      ).toBe(true);
    }
  });

  it("documents supported grading modes without inventing assignment-level publishing fields", () => {
    expect(readAssignment("java-junit-checkstyle").grading).toMatchObject({
      enabled: true,
      mode: "preset",
      preset: "java-junit-checkstyle",
      workflow: ".github/workflows/grade.yml",
      artifact: "grading-results",
      result_file: "grading-results.json"
    });
    expect(readAssignment("custom-command").grading?.mode).toBe("custom-workflow");
    expect(readAssignment("github-classroom").grading?.mode).toBe("custom-workflow");
    expect(readAssignment("contract-only").grading?.mode).toBe("contract-only");
    expect(readAssignment("faculty-provided-report").grading?.mode).toBe("custom-workflow");

    const noGrading = readAssignment("no-grading").grading;

    expect(noGrading?.enabled).toBe(false);
    expect(noGrading).not.toHaveProperty("workflow");
    expect(noGrading).not.toHaveProperty("artifact");
    expect(noGrading).not.toHaveProperty("result_file");
  });

  it("keeps workflow examples compatible with Graider validation expectations", () => {
    for (const exampleName of [
      "custom-command",
      "github-classroom",
      "contract-only",
      "faculty-provided-report"
    ] as const) {
      const workflow = workflowText(
        exampleName,
        exampleName === "github-classroom"
          ? ".github/workflows/classroom.yml"
          : ".github/workflows/grade.yml"
      );

      expect(workflow, exampleName).toContain("workflow_dispatch");
      expect(workflow, exampleName).toContain("actions/upload-artifact@v4");
      expect(workflow, exampleName).toContain("grading-results");
      expect(workflow, exampleName).toContain("grading-results.json");
    }
  });

  it("shows result writer and publishing guidance for specialized examples", () => {
    const customWorkflow = workflowText("custom-command");

    expect(customWorkflow).toContain(".graider/write-grading-result.py");
    expect(customWorkflow).toContain("steps.custom-check.outcome");
    expect(customWorkflow).not.toContain("steps.custom-check.outputs.result");

    const classroomWorkflow = workflowText("github-classroom", ".github/workflows/classroom.yml");
    const classroomReadme = readText(examplePath("github-classroom", "README.md"));

    expect(classroomWorkflow).not.toContain("outputs.result");
    expect(classroomReadme).toContain("outputs.result");
    expect(classroomReadme).toContain("step outcome");

    const facultyAssignment = readAssignment("faculty-provided-report");
    const facultyReadme = readText(examplePath("faculty-provided-report", "README.md"));
    const facultyWorkflow = workflowText("faculty-provided-report");
    const facultyCourseSnippet = readText(
      examplePath("faculty-provided-report", "course-reports-snippet.yml")
    );

    expect(facultyAssignment.grading?.artifact).toBe("grading-results");
    expect(facultyCourseSnippet).toContain("source_file: graider-output/student-report.md");
    expect(facultyCourseSnippet).toContain("destination_file: grading/report.md");
    expect(facultyWorkflow).toContain("graider-output/student-report.md");
    expect(facultyReadme).toContain("copies the student report without parsing");
  });

  it("keeps contract-only and no-grading boundaries explicit", () => {
    const contractReadme = readText(examplePath("contract-only", "README.md"));
    const noGradingReadme = readText(examplePath("no-grading", "README.md"));

    expect(contractReadme).toContain("Graider does not generate or understand");
    expect(contractReadme).toContain("faculty owns the grading semantics");
    expect(noGradingReadme).toContain("grade is a no-op");
    expect(noGradingReadme).toContain("workflow generate does not generate");
    expect(fs.existsSync(examplePath("no-grading", ".github"))).toBe(false);
  });
});
