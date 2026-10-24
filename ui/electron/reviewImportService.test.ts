// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReviewImportService, isImportApplyRequest } from "./reviewImportService";
import type * as Backend from "../dist-electron/reviewImportBackend.cjs";
const loadCjs = createRequire(path.resolve("electron/reviewImportService.test.ts"));
const backend = loadCjs("../dist-electron/reviewImportBackend.cjs") as typeof Backend;
type Context = Awaited<ReturnType<typeof backend.createContext>>;
const SHA_LENGTH = 40;
const SHA = "a".repeat(SHA_LENGTH);
const OLD = "b".repeat(SHA_LENGTH);
const roots: string[] = [];
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-import-test-"));
  roots.push(root);
  fs.cpSync(path.resolve("../tests/fixtures/roster/valid-course"), root, { recursive: true });
  fs.appendFileSync(
    path.join(root, "terms/27s1/assignments/lab04/assignment.yml"),
    "\ngrading:\n  required_files:\n    - src/Main.java\n  rubric:\n    - id: design\n      name: Design\n      points: 10\n"
  );

  const request = {
    courseFolderId: "course",
    courseFolderPath: root,
    termCode: "27s1",
    assignmentSlug: "lab04",
    userDataPath: root
  };
  const student = {
    studentId: "jones",
    githubUsername: "seanjones",
    firstName: "Sean",
    lastName: "Jones",
    section: "001"
  };
  const statePath = path.join(root, ".graider/grading/27s1/lab04/state/jones.json");
  const state = {
    schemaVersion: 1,
    studentId: "jones",
    submissionCommitSha: SHA,
    status: "published",
    appliedComments: [{ id: "manual", text: "Keep manual", deduction: 1 }],
    manualAdjustments: [{ id: "note", rubricCategoryId: "design", amount: 0, note: "Keep note" }],
    viewState: { scrollTop: 12, cursor: { file: "src/Main.java", line: 1, column: 1 } }
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state));
  const readState = () =>
    JSON.parse(fs.readFileSync(statePath, "utf8")) as typeof state & {
      appliedComments: ((typeof state.appliedComments)[number] & {
        title?: string;
        rubricCategoryId?: string;
        tags?: string[];
        sourceLocation?: unknown;
        sourceAnchor?: unknown;
        importProvenance?: { reviewId: string; findingId: string };
      })[];
    };
  const review = {
    schemaVersion: 1,
    reviewId: "review-1",
    assignment: { courseCode: "SE2030", termCode: "27s1", assignmentSlug: "lab04" },
    student: { studentId: "jones", githubUsername: "seanjones" },
    repository: { owner: "example-org", name: "repo", reviewedCommitSha: SHA },
    findings: [
      {
        id: "finding-1",
        title: "Design issue",
        text: "**Improve** `input`\n\n[Reference](javascript:alert(1))",
        deduction: 2,
        rubric: { id: "design" },
        tags: ["design"],
        sourceLocation: {
          file: "src/Main.java",
          startLine: 1,
          endLine: 1,
          excerpt: "input.trim();"
        }
      },
      { id: "general", title: "General", text: "General feedback", deduction: 1 }
    ]
  };
  const input = path.join(root, "review.json");
  const writeReview = () => fs.writeFileSync(input, JSON.stringify(review));
  writeReview();
  let currentSha = SHA;
  let category = "design";
  const context = (): Context => ({
    assignment: review.assignment,
    rubric: [{ id: category, name: "Design", points: 10 }],
    submissions: [
      {
        student,
        repository: { owner: "example-org", name: "repo" },
        currentCommitSha: currentSha,
        gradingState: readState() as Context["submissions"][number]["gradingState"],
        diagnostics: []
      }
    ],
    repository: async () => ({
      matchesRepository: async () => true,
      isInHistory: async () => true,
      readRevisionFile: async (sha) =>
        sha === OLD || review.repository.reviewedCommitSha === SHA
          ? "input.trim();\n"
          : "// Header\ninput.trim();\n"
    })
  });
  const choose = vi.fn(async () => ({ canceled: false, filePaths: [input] }));
  const createContext = vi.fn(async () => context());
  const applyFinding = vi.fn(backend.applyFinding);
  const service = createReviewImportService({
    backend: () => ({ ...backend, createContext, applyFinding }),
    showOpenDialog: choose,
    scope: () => ({ status: "success", students: [student], sections: ["001"], errors: [] }),
    repository: () => ({ status: "success", localPath: root })
  });
  const preview = () => service.choose(request, 1);
  const apply = async (value: Backend.ImportPreview, approved = false, indexes = [0, 1]) =>
    service.apply(
      {
        ...request,
        planId: value.planId,
        version: value.version,
        selections: indexes.map((index) => ({
          reviewIndex: 0,
          studentId: "jones",
          findingKey: value.plan.reviews[0]!.findings[index]!.key,
          approved
        }))
      },
      1
    );
  return {
    request,
    review,
    writeReview,
    readState,
    state,
    statePath,
    service,
    preview,
    apply,
    choose,
    applyFinding,
    createContext,
    setSha: (sha: string) => {
      currentSha = sha;
    },
    setCategory: (id: string) => {
      category = id;
    },
    OLD
  };
};
afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});
const required = <T>(value: T | null): T => {
  if (value === null) throw new Error("Missing preview");
  return value;
};
describe("trusted review import workflow", () => {
  it("uses native multi-selection and cancel does not plan or mutate", async () => {
    const f = fixture();
    f.choose.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await f.preview()).toBeNull();
    expect(f.createContext).not.toHaveBeenCalled();
    expect(f.readState()).toEqual(f.state);
    expect(f.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Review JSON", extensions: ["json"] }]
      })
    );
  });
  it("plans trusted files and additively applies normal comments with new identities and durable provenance", async () => {
    const f = fixture();
    const p = required(await f.preview());
    expect(p.plan.summary).toMatchObject({ ready: 1, eligibleFindings: 2 });
    expect(f.readState()).toEqual(f.state);
    expect(await f.apply(p)).toMatchObject({ applied: 2, failed: 0, studentsAffected: 1 });
    const state = f.readState();
    expect(state).toMatchObject({
      status: "published",
      manualAdjustments: f.state.manualAdjustments,
      viewState: f.state.viewState,
      submissionCommitSha: SHA
    });
    expect(state.appliedComments[0]).toEqual(f.state.appliedComments[0]);
    expect(state.appliedComments[1]).toMatchObject({
      title: "Design issue",
      text: f.review.findings[0]!.text,
      deduction: 2,
      tags: ["design"],
      rubricCategoryId: "design",
      sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 },
      importProvenance: { source: "review_import", reviewId: "review-1", findingId: "finding-1" }
    });
    expect(state.appliedComments[1]!.id).not.toBe("finding-1");
    expect(state.appliedComments[2]).not.toHaveProperty("sourceLocation");
    expect(await f.apply(p)).toMatchObject({ applied: 0, duplicatesSkipped: 2, failed: 0 });
  });
  it("recognizes faculty-edited imports and imports different IDs with identical text", async () => {
    const f = fixture();
    await f.apply(required(await f.preview()));
    const edited = f.readState();
    edited.appliedComments[1]!.text = "Faculty edits";
    fs.writeFileSync(f.statePath, JSON.stringify(edited));
    const p = required(await f.preview());
    expect(p.plan.summary.duplicate).toBe(1);
    expect(f.readState().appliedComments[1]!.text).toBe("Faculty edits");
    f.review.findings[0]!.id = "another";
    f.review.reviewId = "review-2";
    f.writeReview();
    expect(await f.apply(required(await f.preview()), false, [0])).toMatchObject({ applied: 1 });
  });
  it("skips duplicates introduced after preview without replacing faculty work", async () => {
    const f = fixture();
    const p = required(await f.preview());
    await f.apply(p, false, [0]);
    expect(await f.apply(p)).toMatchObject({ applied: 1, duplicatesSkipped: 1, failed: 0 });
  });
  it("requires explicit recovery approval and persists relocated location and original history", async () => {
    const f = fixture();
    f.review.repository.reviewedCommitSha = OLD;
    f.writeReview();
    const p = required(await f.preview());
    expect(p.plan.reviews[0]!.findings[0]).toMatchObject({
      requiresApproval: true,
      recoveryRequired: true
    });
    expect(await f.apply(p, false, [0])).toMatchObject({ applied: 0, failed: 1 });
    expect(await f.apply(p, true, [0])).toMatchObject({ applied: 1 });
    expect(f.readState().appliedComments[1]).toMatchObject({
      sourceLocation: { startLine: 2 },
      sourceAnchor: {
        originalCommitSha: OLD,
        originalLocation: { startLine: 1 },
        originalText: "input.trim();"
      }
    });
  });
  it("blocks unsafe anchors even with approval", async () => {
    const f = fixture();
    f.review.findings[0]!.sourceLocation!.excerpt = "missing();";
    f.writeReview();
    expect(await f.apply(required(await f.preview()), true, [0])).toMatchObject({
      applied: 0,
      failed: 1
    });
  });
  it("requires approval for unique-name rubric fallback", async () => {
    const f = fixture();
    f.review.findings[0]!.rubric = { name: "Design" } as unknown as { id: string };
    f.writeReview();
    const p = required(await f.preview());
    expect(await f.apply(p, false, [0])).toMatchObject({ applied: 0, failed: 1 });
    expect(await f.apply(p, true, [0])).toMatchObject({ applied: 1 });
  });
  it("rejects stale assignment, student, plan, owner and malformed selections", async () => {
    const f = fixture();
    const p = required(await f.preview());
    const request = {
      ...f.request,
      planId: p.planId,
      version: 1 as const,
      selections: [
        {
          reviewIndex: 0,
          studentId: "other",
          findingKey: p.plan.reviews[0]!.findings[0]!.key,
          approved: true
        }
      ]
    };
    expect(await f.service.apply(request, 1)).toMatchObject({ applied: 0, failed: 1 });
    await expect(f.service.apply({ ...request, assignmentSlug: "another" }, 1)).rejects.toThrow(
      "expired"
    );
    await expect(f.service.apply({ ...request, planId: "fake" }, 1)).rejects.toThrow("expired");
    await expect(f.service.apply(request, 2)).rejects.toThrow("expired");
    expect(isImportApplyRequest({ ...request, selections: [{}] })).toBe(false);
    f.service.close(1);
    await expect(f.service.apply(request, 1)).rejects.toThrow("expired");
  });
  it("blocks changed SHA and missing rubric targets", async () => {
    const f = fixture();
    const p = required(await f.preview());
    f.setSha(OLD);
    expect(await f.apply(p, true)).toMatchObject({ applied: 0, failed: 2 });
    f.setSha(SHA);
    f.setCategory("removed");
    expect(await f.apply(p, true, [0])).toMatchObject({ applied: 0, failed: 1 });
  });
  it("preserves successful unrelated findings on partial failure and reports accurate results", async () => {
    const f = fixture();
    f.applyFinding.mockImplementationOnce(() => {
      throw new Error("disk error");
    });
    expect(await f.apply(required(await f.preview()))).toMatchObject({
      applied: 1,
      failed: 1,
      duplicatesSkipped: 0,
      studentsAffected: 1
    });
    expect(f.readState().appliedComments).toHaveLength(2);
  });
  it("preserves zero-score and incomplete states", async () => {
    const f = fixture();
    fs.writeFileSync(
      f.statePath,
      JSON.stringify({ ...f.state, status: "not_started", finalScoreOverride: 0 })
    );
    await f.apply(required(await f.preview()));
    expect(f.readState()).toMatchObject({ status: "not_started", finalScoreOverride: 0 });
  });
});

it("imported comments participate in the normal grade projection and remain editable, duplicable and deletable", async () => {
  const f = fixture();
  await f.apply(required(await f.preview()));
  const request = {
    courseFolderPath: f.request.courseFolderPath,
    termCode: "27s1",
    assignmentSlug: "lab04",
    studentId: "jones",
    currentSubmissionCommitSha: SHA
  };
  const comments = loadCjs("../dist-electron/gradingStudentCommentBackend.cjs") as {
    editGradingStudentCommentContext: (
      request: unknown,
      id: string,
      replacement: unknown
    ) => { status: string };
    addGradingStudentCommentContext: (
      request: unknown,
      comment: unknown,
      original: string
    ) => { status: string };
    deleteGradingStudentCommentContext: (request: unknown, id: string) => { status: string };
  };
  const snapshots = loadCjs("../dist-electron/gradingStudentSnapshotBackend.cjs") as {
    loadGradingStudentSnapshotContext: (request: unknown) => unknown;
  };
  expect(snapshots.loadGradingStudentSnapshotContext(request)).toMatchObject({
    status: "success",
    grade: { totalScore: 6 }
  });
  const imported = f.readState().appliedComments[1]!;
  expect(
    comments.editGradingStudentCommentContext(request, imported.id, {
      title: "Faculty title",
      text: "Faculty body",
      deduction: 3,
      rubricCategoryId: "design",
      sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 }
    }).status
  ).toBe("success");
  expect(f.readState().appliedComments[1]).toMatchObject({
    text: "Faculty body",
    importProvenance: imported.importProvenance
  });
  expect(
    comments.addGradingStudentCommentContext(request, { id: "faculty-duplicate" }, imported.id)
      .status
  ).toBe("success");
  expect(comments.deleteGradingStudentCommentContext(request, "faculty-duplicate").status).toBe(
    "success"
  );
  expect(required(await f.preview()).plan.reviews[0]!.findings[0]!.duplicate).toBe(true);
  expect(f.readState().appliedComments[1]!.text).toBe("Faculty body");
  expect(comments.deleteGradingStudentCommentContext(request, imported.id).status).toBe("success");
  expect(f.readState().appliedComments.some((comment) => comment.id === imported.id)).toBe(false);
});

it("enforces Slice 1 batch and byte limits at the trusted file boundary", async () => {
  const f = fixture();
  const file = path.join(f.request.courseFolderPath, "review.json");
  f.choose.mockResolvedValue({
    canceled: false,
    filePaths: Array.from({ length: backend.MAX_REVIEW_FILES + 1 }, () => file)
  });
  const oversizedBatch = required(await f.preview());
  expect(oversizedBatch.plan.summary.invalid).toBe(backend.MAX_REVIEW_FILES + 1);
  expect(oversizedBatch.plan.diagnostics[0]?.code).toBe("too_many_files");
  fs.writeFileSync(file, Buffer.alloc(backend.MAX_REVIEW_FILE_BYTES + 1, "x"));
  f.choose.mockResolvedValue({ canceled: false, filePaths: [file] });
  expect(required(await f.preview()).plan.reviews[0]?.diagnostics[0]?.code).toBe("file_too_large");
});

it("rejects injected persisted-comment fields and invalid assignment identities in selection requests", () => {
  const request = {
    courseFolderId: "course",
    courseFolderPath: "/trusted",
    termCode: "27s1",
    assignmentSlug: "lab04",
    planId: "plan",
    version: 1,
    selections: [{ reviewIndex: 0, studentId: "ada", findingKey: "key", approved: true }]
  };
  expect(isImportApplyRequest(request)).toBe(true);
  expect(isImportApplyRequest({ ...request, assignmentSlug: "" })).toBe(false);
  expect(isImportApplyRequest({ ...request, assignmentSlug: "../../other" })).toBe(false);
  expect(isImportApplyRequest({ ...request, termCode: "../../other" })).toBe(false);
  expect(
    isImportApplyRequest({
      ...request,
      selections: [{ ...request.selections[0], comment: { id: "injected", text: "unsafe" } }]
    })
  ).toBe(false);
});
