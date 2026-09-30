import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument } from "yaml";
import { describe, expect, it } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { getEffectiveAssignmentGrading } from "../../../src/config/effective-grading.js";
import { isManagedGradingWorkflowEligible } from "../../../src/workflows/managed-workflow-deployment.js";
import { saveAssignmentSetup } from "../../../ui/electron/assignmentSetupService.js";
import { saveCourseSetup } from "../../../ui/electron/courseSetupService.js";

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab02/assignment.yml";

const createGeneratedCourse = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-generated-config-"));
  const courseResult = saveCourseSetup({
    courseFolderPath: root,
    courseTitle: "Data Structures",
    courseCode: "csc1120",
    githubOrganization: "graider-sandbox",
    termCode: "27s1",
    sections: [{ id: "001", faculty: [] }],
    rosterUploads: [],
    gradingEnabled: true,
    confirmed: true,
    replaceExisting: false
  });
  if (courseResult.status !== "success") throw new Error("Expected generated course config.");

  const assignmentResult = saveAssignmentSetup({
    courseFolderId: "course-folder",
    courseFolderPath: root,
    assignmentTitle: "Lab 02",
    assignmentSlug: "lab02",
    termCode: "27s1",
    sectionIds: ["001"],
    templateRepository: "graider-sandbox/lab02-template",
    templateBranch: "main",
    dueAt: "2027-06-15T23:59:00-05:00",
    gradingEnabled: true,
    points: 100,
    facultyOwner: "professor",
    lmsAssignmentId: "",
    gradingCategory: "labs",
    requiredFiles: ["src/Main.java"],
    rubric: [{ id: "correctness", name: "Correctness", points: 40 }],
    confirmed: true,
    replaceExisting: false
  });
  if (assignmentResult.status !== "success")
    throw new Error("Expected generated assignment config.");
  return root;
};

const loadGeneratedConfig = (root: string) =>
  loadGraiderConfig({ cwd: root, assignmentFile: ASSIGNMENT_FILE });

describe("setup-generated grading configuration", () => {
  it("loads Assignment Setup YAML and recognizes its explicit managed preset", () => {
    const result = loadGeneratedConfig(createGeneratedCourse());

    expect(result.status).toBe("success");
    if (result.status === "failure") throw new Error(JSON.stringify(result.diagnostics));
    expect(result.config.assignment.grading).toEqual({
      enabled: true,
      mode: "preset",
      preset: "java-junit-checkstyle",
      workflow: ".github/workflows/grade.yml",
      artifact: "grading-results",
      result_file: "grading-results.json",
      required_files: ["src/Main.java"],
      rubric: [{ id: "correctness", name: "Correctness", points: 40 }]
    });
    expect(isManagedGradingWorkflowEligible(getEffectiveAssignmentGrading(result.config))).toBe(
      true
    );
  });

  it("keeps Course Setup defaults managed-preset eligible through assignment inheritance", () => {
    const root = createGeneratedCourse();
    const assignmentPath = path.join(root, ASSIGNMENT_FILE);
    const assignmentDocument = parseDocument(fs.readFileSync(assignmentPath, "utf8"));
    assignmentDocument.delete("grading");
    fs.writeFileSync(assignmentPath, assignmentDocument.toString(), "utf8");

    const result = loadGeneratedConfig(root);

    expect(result.status).toBe("success");
    if (result.status === "failure") throw new Error(JSON.stringify(result.diagnostics));
    expect(result.config.course.grading).toEqual({
      enabled: true,
      mode: "preset",
      preset: "java-junit-checkstyle",
      workflow: ".github/workflows/grade.yml",
      artifact: "grading-results",
      result_file: "grading-results.json"
    });
    expect(result.config.summary.gradingSource).toBe("course");
    expect(isManagedGradingWorkflowEligible(getEffectiveAssignmentGrading(result.config))).toBe(
      true
    );
  });
});
