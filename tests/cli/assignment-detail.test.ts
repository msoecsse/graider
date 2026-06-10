import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAssignmentDetailResultAsJson,
  runAssignmentDetailCommand
} from "../../src/cli/commands/assignment.command.js";
import type { AssignmentDetailResult } from "../../src/assignment-detail/assignment-detail-models.js";

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const VALID_CONFIG_ROOT = path.resolve("tests/fixtures/config/valid-course");
const GRADING_DISABLED_ROOT = path.resolve("tests/fixtures/config/grading-disabled");
const VALID_ROSTER_ROOT = path.resolve("tests/fixtures/roster/valid-course");
const INVALID_ASSIGNMENT_ROOT = path.resolve("tests/fixtures/config/missing-assignment-field");
const REPORT_FIXTURE_ROOT = path.resolve("tests/fixtures/report/publish-success");
const TEMP_FIXTURE_PREFIX = "graider-assignment-detail-";
const EMPTY_COUNT = 0;

const copyFixtureToTemp = (fixtureRoot: string): string => {
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_FIXTURE_PREFIX));

  fs.cpSync(fixtureRoot, destinationRoot, { recursive: true });
  return destinationRoot;
};

const runDetail = (
  cwd: string,
  options: Parameters<typeof runAssignmentDetailCommand>[0]["options"] = { json: true },
  assignmentFile = ASSIGNMENT_FILE
): AssignmentDetailResult =>
  runAssignmentDetailCommand({
    cwd,
    assignmentFile,
    options
  });

const appendAssignmentYaml = (cwd: string, yaml: string): void => {
  fs.appendFileSync(path.join(cwd, ASSIGNMENT_FILE), `\n${yaml}`);
};

const appendCourseYaml = (cwd: string, yaml: string): void => {
  fs.appendFileSync(path.join(cwd, "course.yml"), `\n${yaml}`);
};

const listFiles = (cwd: string): string[] =>
  fs
    .readdirSync(cwd, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(cwd, path.join(entry.parentPath, entry.name)))
    .sort((left, right) => left.localeCompare(right));

describe("graider assignment detail command", () => {
  it("requires JSON output and returns a JSON failure shape", () => {
    const result = runDetail(VALID_CONFIG_ROOT, {});
    const json = JSON.parse(formatAssignmentDetailResultAsJson(result)) as AssignmentDetailResult;

    expect(json.schemaVersion).toBe(1);
    expect(json.commandName).toBe("assignment detail");
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(1);
    expect(json.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_json_required" })
    ]);
    expect(json.course).toBeNull();
    expect(json.sections).toEqual([]);
  });

  it("returns the assignment detail JSON contract for a valid assignment", () => {
    const result = runDetail(VALID_CONFIG_ROOT);

    expect(result).toMatchObject({
      schemaVersion: 1,
      commandName: "assignment detail",
      status: "success",
      exitCode: 0,
      course: {
        slug: "se2030",
        title: "Software Engineering",
        file: "course.yml"
      },
      term: {
        slug: "27s1",
        title: "Spring 2027",
        file: "terms/27s1/term.yml"
      },
      assignment: {
        slug: "lab04",
        title: "Lab 04",
        type: "individual",
        status: "active",
        file: ASSIGNMENT_FILE
      },
      metadata: {
        facultyOwner: "professor",
        lmsAssignmentId: null,
        gradingCategory: "labs",
        points: 100
      },
      deadline: {
        dueAt: "2027-04-15T23:59:00+09:00",
        latePolicy: "standard"
      },
      sections: ["001"],
      template: {
        repository: "example-org/lab04-template",
        branch: "main",
        status: "not_checked"
      },
      grading: {
        enabled: true,
        mode: "custom-workflow",
        workflow: "grade.yml",
        artifact: "grading-results",
        resultFile: "results.json",
        workflowStatus: "not_checked",
        workflowDispatch: "not_checked"
      },
      studentReports: {
        enabled: false,
        mode: "disabled"
      },
      applyState: {
        status: "not_applied"
      }
    });
    expect(result.actions).toEqual({
      validate: { available: true, implemented: true },
      apply: { available: true, implemented: false },
      grade: { available: true, implemented: false },
      report: { available: true, implemented: false },
      publishStudentReports: { available: false, implemented: false },
      generateWorkflow: { available: false, implemented: false }
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("includes roster section, active student, and total student counts", () => {
    const result = runDetail(VALID_ROSTER_ROOT);

    expect(result.status).toBe("success");
    expect(result.roster).toEqual({
      sectionCount: 2,
      activeStudentCount: 2,
      totalStudentCount: 4
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("reports missing assignment files as failure JSON", () => {
    const result = runDetail(VALID_CONFIG_ROOT, { json: true }, "terms/27s1/assignments/nope.yml");

    expect(result.status).toBe("failure");
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing_required_file" })
    ]);
    expect(result.assignment).toBeNull();
  });

  it("reports invalid assignment config as failure JSON diagnostics", () => {
    const result = runDetail(INVALID_ASSIGNMENT_ROOT);

    expect(result.status).toBe("failure");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing_required_field" })
    ]);
    expect(result.assignment).toBeNull();
  });

  it("keeps assignment detail available when roster files are missing", () => {
    const result = runDetail(GRADING_DISABLED_ROOT);

    expect(result.status).toBe("partial_success");
    expect(result.assignment?.slug).toBe("lab04");
    expect(result.roster).toEqual({
      sectionCount: 1,
      activeStudentCount: 0,
      totalStudentCount: 0
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing_required_file" })
    ]);
  });

  it("represents no-grading assignments without requiring workflow fields", () => {
    const cwd = copyFixtureToTemp(VALID_ROSTER_ROOT);

    appendAssignmentYaml(
      cwd,
      `grading:
  enabled: false
`
    );

    const result = runDetail(cwd);

    expect(result.status).toBe("success");
    expect(result.grading).toEqual({
      enabled: false,
      mode: "no-grading",
      workflow: null,
      artifact: null,
      resultFile: null,
      workflowStatus: "not_required",
      workflowDispatch: "not_required"
    });
    expect(result.actions?.grade.available).toBe(false);
    expect(result.actions?.generateWorkflow.available).toBe(false);
  });

  it("includes student report publishing configuration and action availability", () => {
    const cwd = copyFixtureToTemp(VALID_ROSTER_ROOT);

    appendCourseYaml(
      cwd,
      `  student_publish:
    enabled: true
    mode: faculty-provided
    artifact: grading-results
    source_file: reports/student.md
    destination_file: feedback/report.md
`
    );

    const result = runDetail(cwd);

    expect(result.studentReports).toMatchObject({
      enabled: true,
      mode: "faculty-provided",
      artifact: "grading-results",
      sourceFile: "reports/student.md",
      destinationFile: "feedback/report.md"
    });
    expect(result.actions?.publishStudentReports.available).toBe(true);
  });

  it("reports applied state when a local manifest exists", () => {
    const result = runDetail(REPORT_FIXTURE_ROOT);

    expect(result.applyState).toEqual({ status: "applied" });
  });

  it("does not require GRAIDER_GITHUB_TOKEN and does not mutate local files", () => {
    const cwd = copyFixtureToTemp(VALID_ROSTER_ROOT);
    const before = listFiles(cwd);
    const originalToken = process.env.GRAIDER_GITHUB_TOKEN;

    try {
      Reflect.deleteProperty(process.env, "GRAIDER_GITHUB_TOKEN");
      const result = runDetail(cwd);

      expect(result.status).toBe("success");
      expect(result.diagnostics).toHaveLength(EMPTY_COUNT);
      expect(listFiles(cwd)).toEqual(before);
    } finally {
      if (originalToken !== undefined) {
        process.env.GRAIDER_GITHUB_TOKEN = originalToken;
      }
    }
  });
});
