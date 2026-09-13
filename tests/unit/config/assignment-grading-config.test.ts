import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import {
  getAssignmentForEdit,
  saveAssignmentEdit
} from "../../../ui/electron/assignmentEditService.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/config/valid-course");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const temporaryPaths: string[] = [];

const createCourse = (grading: string): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-assignment-grading-"));
  temporaryPaths.push(root);
  fs.cpSync(FIXTURE_ROOT, root, { recursive: true });
  fs.appendFileSync(path.join(root, ASSIGNMENT_FILE), `\ngrading:\n${grading}`, "utf8");
  return root;
};

const load = (root: string) => loadGraiderConfig({ cwd: root, assignmentFile: ASSIGNMENT_FILE });

const expectSuccess = (root: string) => {
  const result = load(root);
  expect(result.status).toBe("success");
  if (result.status === "failure") throw new Error("Expected assignment grading config to load.");
  return result.config.assignment;
};

const expectFailure = (grading: string) => {
  const result = load(createCourse(grading));
  expect(result.status).toBe("failure");
};

afterEach(() => {
  for (const temporaryPath of temporaryPaths.splice(0)) {
    fs.rmSync(temporaryPath, { recursive: true, force: true });
  }
});

describe("assignment grading configuration", () => {
  it("keeps legacy assignments with no grading block valid", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-assignment-grading-legacy-"));
    temporaryPaths.push(root);
    fs.cpSync(FIXTURE_ROOT, root, { recursive: true });
    expectSuccess(root);
  });

  it("loads required files and preserves their configured order", () => {
    const assignment = expectSuccess(
      createCourse(`  enabled: false
  required_files:
    - " src/First.java "
    - src/Second.java
`)
    );
    expect(assignment.grading?.required_files).toEqual(["src/First.java", "src/Second.java"]);
  });

  it("loads a flat rubric and preserves category order", () => {
    const assignment = expectSuccess(
      createCourse(`  enabled: false
  rubric:
    - id: " correctness "
      name: " Correctness "
      points: 40
    - id: design
      name: Design
      points: 25
`)
    );
    expect(assignment.grading?.rubric).toEqual([
      { id: "correctness", name: "Correctness", points: 40 },
      { id: "design", name: "Design", points: 25 }
    ]);
  });

  it("loads required files and a rubric without changing unrelated assignment fields", () => {
    const assignment = expectSuccess(
      createCourse(`  enabled: false
  required_files:
    - src/SomeFile.java
  rubric:
    - id: correctness
      name: Correctness
      points: 40
`)
    );
    expect(assignment.metadata).toMatchObject({ faculty_owner: "professor", points: 100 });
    expect(assignment.template).toEqual({
      repository: "example-org/lab04-template",
      branch: "main"
    });
  });

  it("round-trips grading configuration through the existing assignment writer and loader", () => {
    const root = createCourse(`  enabled: false
  required_files:
    - src/First.java
    - src/Second.java
  rubric:
    - id: correctness
      name: Correctness
      points: 40
    - id: design
      name: Design
      points: 25
`);
    const model = getAssignmentForEdit(root, ASSIGNMENT_FILE).model;
    if (model === null) throw new Error("Expected assignment editor model.");

    expect(
      saveAssignmentEdit({
        courseFolderId: "course",
        courseFolderPath: root,
        assignmentFile: ASSIGNMENT_FILE,
        assignmentTitle: model.assignmentTitle,
        sectionIds: model.sectionIds,
        templateRepository: model.templateRepository,
        templateBranch: model.templateBranch,
        dueAt: model.dueAt,
        latePolicy: model.latePolicy,
        assignmentStatus: model.assignmentStatus,
        gradingEnabled: model.gradingEnabled,
        points: model.points,
        facultyOwner: model.facultyOwner,
        lmsAssignmentId: model.lmsAssignmentId ?? "",
        gradingCategory: model.gradingCategory,
        gradingMode: model.gradingMode,
        gradingPreset: model.gradingPreset,
        requiredFiles: model.requiredFiles,
        rubric: model.rubric,
        originalContent: model.originalContent,
        confirmed: true
      }).status
    ).toBe("success");
    expect(expectSuccess(root).grading).toMatchObject({
      required_files: ["src/First.java", "src/Second.java"],
      rubric: [
        { id: "correctness", name: "Correctness", points: 40 },
        { id: "design", name: "Design", points: 25 }
      ]
    });
  });

  it("rejects blank required files, rubric IDs, rubric names, duplicate IDs, and invalid points", () => {
    expectFailure(`  enabled: false
  required_files:
    - "  "
`);
    expectFailure(`  enabled: false
  rubric:
    - id: " "
      name: Correctness
      points: 40
`);
    expectFailure(`  enabled: false
  rubric:
    - id: correctness
      name: " "
      points: 40
`);
    expectFailure(`  enabled: false
  rubric:
    - id: correctness
      name: Correctness
      points: 40
    - id: correctness
      name: More Correctness
      points: 20
`);
    expectFailure(`  enabled: false
  rubric:
    - id: correctness
      name: Correctness
      points: .inf
`);
  });
});
