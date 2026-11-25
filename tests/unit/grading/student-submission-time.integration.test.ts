import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec as executeDugite } from "dugite";
import { afterEach, expect, it, vi } from "vitest";
import * as gitContext from "../../../src/git/dugite-git-workspace-context.js";
import { readGradingStudentSubmissionTime } from "../../../src/grading/student-submission-time.js";
import { loadGradingStudentSnapshotContext } from "../../../src/grading/grading-student-snapshot-context.js";
import { createGradingStudentSnapshotService } from "../../../ui/electron/gradingStudentSnapshotService.js";
import {
  createInitialGradingState,
  saveGradingState,
  createGradingStatePath
} from "../../../src/grading/grading-state.js";
import {
  describeGitIntegration,
  removeGitFixture
} from "../../support/git/integration-fixtures.js";

const roots: string[] = [];
const FIRST_SUBMISSION = "2026-11-21T18:00:00Z";
const FOLLOW_UP = "2026-11-23T21:00:00Z";
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});

describeGitIntegration("local student submission timing", () => {
  it("keeps feedback-only publication out of lateness, caches navigation, and preserves grading bytes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-submission-timing-"));
    roots.push(root);
    const courseRoot = path.join(root, "course");
    const repositoryRoot = path.join(root, "student");
    fs.cpSync(path.resolve("tests/fixtures/roster/valid-course"), courseRoot, { recursive: true });
    fs.mkdirSync(repositoryRoot);
    const git = async (args: readonly string[], date = FIRST_SUBMISSION): Promise<string> => {
      const result = await executeDugite(
        [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.test",
          "-c",
          "commit.gpgsign=false",
          "-c",
          "core.hooksPath=disabled-hooks",
          ...args
        ],
        repositoryRoot,
        {
          env: {
            GIT_AUTHOR_DATE: date,
            GIT_COMMITTER_DATE: date,
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: path.join(root, "empty-config")
          }
        }
      );
      if (result.exitCode !== 0) throw new Error("Local bundled Git fixture command failed.");
      return result.stdout.trim();
    };
    const commit = async (date: string): Promise<string> => {
      await git(["add", "."]);
      await git(["commit", "-m", "Fixture commit"], date);
      return git(["rev-parse", "HEAD"]);
    };
    await git(["init"]);
    fs.writeFileSync(path.join(repositoryRoot, "Main.java"), "template");
    await commit("2026-11-20T18:00:00+00:00");
    fs.writeFileSync(path.join(repositoryRoot, "Main.java"), "student work");
    const firstSha = await commit(FIRST_SUBMISSION);
    const stateRequest = {
      courseRoot,
      termCode: "27s1",
      assignmentSlug: "lab04",
      studentId: "jones"
    };
    const created = createInitialGradingState("jones", firstSha);
    if (created.status !== "success") throw new Error(created.message);
    saveGradingState(stateRequest, {
      ...created.value,
      status: "published",
      finalScoreOverride: 0
    });

    fs.mkdirSync(path.join(repositoryRoot, "grading"));
    fs.writeFileSync(path.join(repositoryRoot, "grading/report.html"), "published feedback");
    const reportSha = await commit("2026-11-24T18:00:00+00:00");
    saveGradingState(stateRequest, {
      ...created.value,
      submissionCommitSha: reportSha,
      status: "published",
      finalScoreOverride: 0
    });
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status !== "success") throw new Error(statePath.message);
    const before = fs.readFileSync(statePath.value, "utf8");
    const factory = gitContext.createDugiteGitWorkspaceFactory();
    const open = vi.spyOn(factory, "open");
    vi.spyOn(gitContext, "createDugiteGitWorkspaceFactory").mockReturnValue(factory);
    const request = { ...stateRequest, repositoryRoot, submissionCommitSha: reportSha };
    await expect(readGradingStudentSubmissionTime(request)).resolves.toBe(FIRST_SUBMISSION);
    await expect(readGradingStudentSubmissionTime(request)).resolves.toBe(FIRST_SUBMISSION);
    expect(open).toHaveBeenCalledTimes(1);

    const snapshotService = createGradingStudentSnapshotService({
      resolveFacultyScope: () => ({
        status: "success",
        sections: ["001"],
        students: [{ studentId: "jones", githubUsername: "jones", section: "001" }],
        errors: []
      }),
      resolveRepository: () => ({ status: "success", localPath: repositoryRoot }),
      readHead: () => Promise.resolve({ status: "success", submissionCommitSha: reportSha }),
      loadBackend: () => ({
        loadGradingStudentSnapshotContext: (contextRequest) => {
          const result = loadGradingStudentSnapshotContext(contextRequest);
          if (result.status !== "success") return result;
          expect(result.appliedComments).toEqual([]);
          expect(result.manualAdjustments).toEqual([]);
          return { ...result, appliedComments: [], manualAdjustments: [] };
        },
        readGradingStudentSubmissionTime
      })
    });
    await expect(
      snapshotService({
        courseFolderId: "course",
        courseFolderPath: courseRoot,
        userDataPath: root,
        termCode: "27s1",
        assignmentSlug: "lab04",
        studentId: "jones"
      })
    ).resolves.toMatchObject({
      status: "success",
      gradingStatus: "published",
      grade: { totalScore: 0 },
      lastStudentWorkAt: FIRST_SUBMISSION
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);

    fs.writeFileSync(path.join(repositoryRoot, "Main.java"), "student corrections");
    const followUpSha = await commit(FOLLOW_UP);
    await expect(
      readGradingStudentSubmissionTime({ ...request, submissionCommitSha: followUpSha })
    ).resolves.toBe(FOLLOW_UP);
    expect(open).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);

    const assignmentFile = path.join(courseRoot, "terms/27s1/assignments/lab04/assignment.yml");
    fs.writeFileSync(
      assignmentFile,
      fs.readFileSync(assignmentFile, "utf8").replace(/^deadline:\n(?: {2}.*\n)*/mu, "")
    );
    await expect(readGradingStudentSubmissionTime(request)).resolves.toBeNull();
    expect(open).toHaveBeenCalledTimes(2);
  });
});
