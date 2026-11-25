// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import {
  createGradingStudentCompleteService,
  type GradingStudentCompleteBackend
} from "./gradingStudentCompleteService.js";
import {
  createGradingStudentSnapshotService,
  type GradingStudentSnapshotBackend
} from "./gradingStudentSnapshotService.js";
import {
  createGradingStudentSourceService,
  type GradingStudentSourceBackend
} from "./gradingStudentSourceService.js";
import type { RepositoryUpdateBackend } from "./gradingStudentRepositoryUpdateService.js";

const load = createRequire(path.join(process.cwd(), "package.json"));
const completeBackend = load(
  "./dist-electron/gradingStudentCompleteBackend.cjs"
) as GradingStudentCompleteBackend;
const updateBackend = load(
  "./dist-electron/gradingStudentRepositoryUpdateBackend.cjs"
) as RepositoryUpdateBackend;
const snapshotBackend = load(
  "./dist-electron/gradingStudentSnapshotBackend.cjs"
) as GradingStudentSnapshotBackend;
const sourceBackend = load(
  "./dist-electron/gradingStudentSourceBackend.cjs"
) as GradingStudentSourceBackend;
const roots: string[] = [];
const SHA = "a".repeat(40);
const NEW_SHA = "b".repeat(40);
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it.each(["submission", "feedback"] as const)(
  "bundled Electron services persist zero -> %s pull -> explicit reopen and reload",
  async (change) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-zero-electron-"));
    roots.push(root);
    const course = path.join(root, "course");
    fs.cpSync(path.resolve("../tests/fixtures/roster/valid-course"), course, { recursive: true });
    fs.appendFileSync(
      path.join(course, "terms/27s1/assignments/lab04/assignment.yml"),
      `
grading:
  required_files: [Main.java]
  rubric:
    - id: code
      name: Code
      points: 100
`
    );
    const repository = path.join(root, "student-fixture");
    fs.mkdirSync(path.join(repository, "src"), { recursive: true });
    const sourceFile = path.join(repository, "src/Main.java");
    fs.writeFileSync(sourceFile, "Original source");
    const request = {
      courseFolderId: "course",
      courseFolderPath: course,
      userDataPath: root,
      termCode: "27s1",
      assignmentSlug: "lab04",
      studentId: "jones"
    };
    const stateFile = path.join(course, ".graider/grading/27s1/lab04/state/jones.json");
    const comments = [{ id: "keep", text: "Instructor note", deduction: 2 }];
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        schemaVersion: 1,
        studentId: "jones",
        submissionCommitSha: SHA,
        status: "in_progress",
        appliedComments: comments,
        manualAdjustments: []
      })
    );
    let head = SHA;
    const dependencies = {
      resolveFacultyScope: vi
        .fn()
        .mockReturnValue({ status: "success", students: [{ studentId: "jones", section: "001" }] }),
      resolveRepository: vi.fn().mockReturnValue({ status: "success", localPath: repository }),
      readHead: vi.fn(async () => ({ status: "success" as const, submissionCommitSha: head }))
    };
    const complete = createGradingStudentCompleteService({
      ...dependencies,
      loadBackend: () => completeBackend
    });
    expect(await complete({ ...request, setScoreToZero: true })).toMatchObject({
      status: "success",
      gradingStatus: "complete"
    });
    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toMatchObject({
      finalScoreOverride: 0,
      status: "complete"
    });
    const workspace = {
      resolveHead: vi.fn(async () => head),
      pullUpstream: vi.fn(async () => {
        head = NEW_SHA;
        if (change === "submission") fs.writeFileSync(sourceFile, "Fresh student correction");
        return { kind: "updated" as const };
      }),
      listTree: vi.fn(async (sha: string) => [
        { path: "src/Main.java", objectId: change === "submission" ? sha : SHA, mode: "100644" },
        { path: "grading/report.html", objectId: sha, mode: "100644" }
      ]),
      readRevisionFile: vi.fn(async () => null)
    };
    // Exercise the production reconciliation with an isolated, in-memory transport.
    const update = updateBackend.updateGradingStudentRepository as (
      request: Parameters<RepositoryUpdateBackend["updateGradingStudentRepository"]>[0],
      workspace: Parameters<RepositoryUpdateBackend["updateGradingStudentRepository"]>[1],
      dependencies: { expectedRepositoryRemote: () => string }
    ) => ReturnType<RepositoryUpdateBackend["updateGradingStudentRepository"]>;
    expect(
      await update(
        { courseRoot: course, termCode: "27s1", assignmentSlug: "lab04", studentId: "jones" },
        workspace,
        {
          expectedRepositoryRemote: () => "https://github.com/test/jones.git"
        }
      )
    ).toEqual({ status: "success" });
    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toMatchObject({
      status: change === "submission" ? "in_progress" : "complete",
      finalScoreOverride: 0,
      submissionCommitSha: NEW_SHA
    });
    expect(await complete({ ...request, undoZeroAndComplete: true })).toMatchObject({
      status: "success",
      gradingStatus: "in_progress"
    });
    const reloaded = createGradingStudentSnapshotService({
      ...dependencies,
      loadBackend: () => ({
        loadGradingStudentSnapshotContext: snapshotBackend.loadGradingStudentSnapshotContext
      })
    });
    expect(await reloaded(request)).toMatchObject({
      status: "success",
      gradingStatus: "in_progress",
      appliedComments: comments,
      grade: { totalScore: 98 }
    });
    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).not.toHaveProperty("finalScoreOverride");
    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toHaveProperty(
      "submissionCommitSha",
      NEW_SHA
    );
    const source = await createGradingStudentSourceService({
      ...dependencies,
      loadBackend: () => sourceBackend
    })(request);
    expect(source).toMatchObject({
      status: "success",
      combinedText: expect.stringContaining(
        change === "submission" ? "Fresh student correction" : "Original source"
      )
    });
  }
);
