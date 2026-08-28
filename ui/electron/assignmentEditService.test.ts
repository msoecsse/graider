import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AssignmentEditRequest } from "./ipc";
import {
  getAssignmentForEdit,
  previewAssignmentEdit,
  saveAssignmentEdit
} from "./assignmentEditService";

const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-assignment-edit-"));
const assignmentFile = "terms/27s1/assignments/lab02/assignment.yml";

const writeFixture = (root: string): void => {
  fs.writeFileSync(path.join(root, "course.yml"), "schema_version: 1\n", "utf8");
  const termPath = path.join(root, "terms/27s1/term.yml");
  fs.mkdirSync(path.dirname(termPath), { recursive: true });
  fs.writeFileSync(
    termPath,
    `term:\n  code: "27s1"\nsections:\n  - id: "001"\n  - id: "002"\n`,
    "utf8"
  );
  const filePath = path.join(root, assignmentFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `schema_version: 1\nassignment:\n  slug: "lab02"\n  title: "Lab 02"\n  type: individual\n  status: active\ntemplate:\n  repository: "owner/template"\n  branch: "main"\nsections:\n  - "001"\ndeadline:\n  due_at: "2027-06-15T23:59:00-05:00"\n  late_policy: standard\nmetadata:\n  faculty_owner: professor\n  lms_assignment_id: null\n  grading_category: labs\n  points: 100\ngrading:\n  enabled: true\n  workflow: .github/workflows/grade.yml\n  artifact: grading-results\n  result_file: grading-results.json\n`,
    "utf8"
  );
};

const removeDeadline = (root: string): void => {
  const filePath = path.join(root, assignmentFile);
  fs.writeFileSync(
    filePath,
    fs.readFileSync(filePath, "utf8").replace(/deadline:\n(?: {2}.*\n){2}/u, ""),
    "utf8"
  );
};

const removePoints = (root: string): void => {
  const filePath = path.join(root, assignmentFile);
  fs.writeFileSync(
    filePath,
    fs.readFileSync(filePath, "utf8").replace(/^  points: .*\n/mu, ""),
    "utf8"
  );
};

const removeFacultyOwnerAndGradingCategory = (root: string): void => {
  const filePath = path.join(root, assignmentFile);
  fs.writeFileSync(
    filePath,
    fs
      .readFileSync(filePath, "utf8")
      .replace(/^  faculty_owner: .*\n/mu, "")
      .replace(/^  grading_category: .*\n/mu, ""),
    "utf8"
  );
};

const removeLmsAssignmentId = (root: string): void => {
  const filePath = path.join(root, assignmentFile);
  fs.writeFileSync(
    filePath,
    fs.readFileSync(filePath, "utf8").replace(/^  lms_assignment_id: .*\n/mu, ""),
    "utf8"
  );
};

const removeMetadata = (root: string): void => {
  const filePath = path.join(root, assignmentFile);
  fs.writeFileSync(
    filePath,
    fs.readFileSync(filePath, "utf8").replace(/metadata:\n(?: {2}.*\n){4}/u, ""),
    "utf8"
  );
};

const removeTemplate = (root: string): void => {
  const filePath = path.join(root, assignmentFile);
  fs.writeFileSync(
    filePath,
    fs.readFileSync(filePath, "utf8").replace(/template:\n(?: {2}.*\n){2}/u, ""),
    "utf8"
  );
};

const createRequest = (root: string): AssignmentEditRequest => {
  const loaded = getAssignmentForEdit(root, assignmentFile).model;
  if (loaded === null) throw new Error("Expected assignment model.");
  return {
    courseFolderId: "course",
    courseFolderPath: root,
    assignmentFile,
    assignmentTitle: "Updated Lab",
    sectionIds: ["001", "002"],
    templateRepository: "https://github.com/owner/updated.git",
    templateBranch: "next",
    dueAt: "2027-06-16T23:59:00-05:00",
    latePolicy: "standard",
    assignmentStatus: "active",
    gradingEnabled: true,
    points: 125,
    facultyOwner: "professor",
    lmsAssignmentId: "",
    gradingCategory: "labs",
    originalContent: loaded.originalContent,
    confirmed: false
  };
};

describe("assignmentEditService", () => {
  it("loads, previews, and saves the same assignment path without changing slug or type", () => {
    const root = createRoot();
    writeFixture(root);
    const request = createRequest(root);
    const preview = previewAssignmentEdit(request);
    expect(preview.status).toBe("ready");
    expect(preview.path).toBe(assignmentFile);
    expect(preview.content).toContain('slug: "lab02"');
    expect(preview.content).toContain("type: individual");
    expect(preview.content).toContain('repository: "owner/updated"');
    expect(saveAssignmentEdit({ ...request, confirmed: true })).toMatchObject({
      status: "success",
      path: assignmentFile
    });
    expect(fs.readFileSync(path.join(root, assignmentFile), "utf8")).toContain(
      'title: "Updated Lab"'
    );
  });

  it("loads and saves an assignment without inventing a template", () => {
    const root = createRoot();
    writeFixture(root);
    removeTemplate(root);
    const loaded = getAssignmentForEdit(root, assignmentFile);

    expect(loaded.model).toMatchObject({ templateRepository: "", templateBranch: "" });
    if (loaded.model === null) throw new Error("Expected assignment model.");
    const request = {
      ...createRequest(root),
      templateRepository: "",
      templateBranch: "",
      originalContent: loaded.model.originalContent
    };

    expect(previewAssignmentEdit(request)).toMatchObject({ status: "ready" });
    expect(previewAssignmentEdit(request).content).not.toContain("template:");
    expect(saveAssignmentEdit({ ...request, confirmed: true }).status).toBe("success");
    expect(fs.readFileSync(path.join(root, assignmentFile), "utf8")).not.toContain("template:");
  });

  it("blocks a save when assignment.yml changes after loading", () => {
    const root = createRoot();
    writeFixture(root);
    const request = createRequest(root);
    fs.appendFileSync(path.join(root, assignmentFile), "# changed externally\n", "utf8");
    expect(previewAssignmentEdit(request).status).toBe("conflict");
    expect(saveAssignmentEdit({ ...request, confirmed: true })).toMatchObject({
      status: "conflict"
    });
  });

  it("loads and saves an assignment without inventing a deadline", () => {
    const root = createRoot();
    writeFixture(root);
    removeDeadline(root);
    const loaded = getAssignmentForEdit(root, assignmentFile);

    expect(loaded.model).toMatchObject({ dueAt: "", latePolicy: "" });
    if (loaded.model === null) throw new Error("Expected assignment model.");
    const preview = previewAssignmentEdit({
      ...createRequest(root),
      dueAt: "",
      latePolicy: "",
      originalContent: loaded.model.originalContent
    });

    expect(preview.status).toBe("ready");
    expect(preview.content).not.toContain("deadline:");
    expect(
      saveAssignmentEdit({
        ...createRequest(root),
        dueAt: "",
        latePolicy: "",
        originalContent: loaded.model.originalContent,
        confirmed: true
      }).status
    ).toBe("success");
    expect(fs.readFileSync(path.join(root, assignmentFile), "utf8")).not.toContain("deadline:");
  });

  it("loads and saves an assignment without inventing points", () => {
    const root = createRoot();
    writeFixture(root);
    removePoints(root);
    const loaded = getAssignmentForEdit(root, assignmentFile);

    expect(loaded.model).toMatchObject({ points: null });
    if (loaded.model === null) throw new Error("Expected assignment model.");
    const request = {
      ...createRequest(root),
      points: null,
      originalContent: loaded.model.originalContent
    };

    expect(previewAssignmentEdit(request)).toMatchObject({ status: "ready" });
    expect(previewAssignmentEdit(request).content).not.toContain("points:");
    expect(saveAssignmentEdit({ ...request, confirmed: true }).status).toBe("success");
    expect(fs.readFileSync(path.join(root, assignmentFile), "utf8")).not.toContain("points:");
  });

  it("loads and saves an assignment without inventing faculty metadata", () => {
    const root = createRoot();
    writeFixture(root);
    removeFacultyOwnerAndGradingCategory(root);
    const loaded = getAssignmentForEdit(root, assignmentFile);

    expect(loaded.model).toMatchObject({ facultyOwner: "", gradingCategory: "" });
    if (loaded.model === null) throw new Error("Expected assignment model.");
    const request = {
      ...createRequest(root),
      facultyOwner: "",
      gradingCategory: "",
      originalContent: loaded.model.originalContent
    };

    expect(previewAssignmentEdit(request)).toMatchObject({ status: "ready" });
    expect(previewAssignmentEdit(request).content).not.toContain("faculty_owner:");
    expect(previewAssignmentEdit(request).content).not.toContain("grading_category:");
    expect(saveAssignmentEdit({ ...request, confirmed: true }).status).toBe("success");
    const content = fs.readFileSync(path.join(root, assignmentFile), "utf8");
    expect(content).not.toContain("faculty_owner:");
    expect(content).not.toContain("grading_category:");
  });

  it("loads and saves an assignment without inventing an LMS assignment ID", () => {
    const root = createRoot();
    writeFixture(root);
    removeLmsAssignmentId(root);
    const loaded = getAssignmentForEdit(root, assignmentFile);

    expect(loaded.model).toMatchObject({ lmsAssignmentId: null });
    if (loaded.model === null) throw new Error("Expected assignment model.");
    const request = {
      ...createRequest(root),
      lmsAssignmentId: "",
      originalContent: loaded.model.originalContent
    };

    expect(previewAssignmentEdit(request)).toMatchObject({ status: "ready" });
    expect(previewAssignmentEdit(request).content).not.toContain("lms_assignment_id:");
    expect(saveAssignmentEdit({ ...request, confirmed: true }).status).toBe("success");
    expect(fs.readFileSync(path.join(root, assignmentFile), "utf8")).not.toContain(
      "lms_assignment_id:"
    );
  });

  it("loads and saves an assignment without inventing metadata", () => {
    const root = createRoot();
    writeFixture(root);
    removeMetadata(root);
    const loaded = getAssignmentForEdit(root, assignmentFile);

    expect(loaded.model).toMatchObject({
      points: null,
      facultyOwner: "",
      lmsAssignmentId: null,
      gradingCategory: ""
    });
    if (loaded.model === null) throw new Error("Expected assignment model.");
    const request = {
      ...createRequest(root),
      points: null,
      facultyOwner: "",
      lmsAssignmentId: "",
      gradingCategory: "",
      originalContent: loaded.model.originalContent
    };

    expect(previewAssignmentEdit(request)).toMatchObject({ status: "ready" });
    expect(previewAssignmentEdit(request).content).not.toContain("metadata:");
    expect(saveAssignmentEdit({ ...request, confirmed: true }).status).toBe("success");
    expect(fs.readFileSync(path.join(root, assignmentFile), "utf8")).not.toContain("metadata:");
  });
});
