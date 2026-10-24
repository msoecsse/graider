import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createReviewImportContext,
  type ReviewContextRequest
} from "../../../src/review-import/review-context.js";
import {
  createReviewRepositoryReader,
  MAX_REVIEW_HISTORY_COMMITS
} from "../../../src/review-import/review-repository.js";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { loadManifest } from "../../../src/manifest/manifest-loader.js";
import { createInitialGradingState } from "../../../src/grading/grading-state.js";
import {
  createRelativeGitPath,
  isObjectId,
  type ObjectId
} from "../../../src/git/git-workspace.js";

const SHA_LENGTH = 40;
const SHA = "a".repeat(SHA_LENGTH);
const OLD_SHA = "b".repeat(SHA_LENGTH);
const objectId = (value: string): ObjectId => {
  if (!isObjectId(value)) throw new Error("Invalid test SHA");
  return value;
};
const request = (): ReviewContextRequest => {
  const config = loadGraiderConfig({
    cwd: path.resolve("tests/fixtures/config/valid-course"),
    assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
  });
  const manifest = loadManifest(
    path.resolve("tests/fixtures/manifest/valid-manifest/manifest.yml")
  );
  if (config.status !== "success" || manifest.status !== "loaded")
    throw new Error("Invalid context fixtures");
  return {
    config: config.config,
    manifest: manifest.manifest,
    students: [{ studentId: "jones", githubUsername: "seanjones" }],
    currentHeads: new Map([["jones", SHA]]),
    repository: () => Promise.resolve(null)
  };
};
const state = () => {
  const result = createInitialGradingState("jones", SHA);
  if (result.status !== "success") throw new Error("Invalid test state");
  return result.value;
};
const workspace = () => ({
  remoteUrl: vi.fn(() => Promise.resolve("https://github.com/example-org/repo.git")),
  resolveRevision: vi.fn((revision: string) => Promise.resolve(objectId(revision))),
  listCommits: vi.fn(() =>
    Promise.resolve([
      { id: objectId(SHA), committedAt: "2026-10-23T00:00:00Z", subject: "Current" },
      { id: objectId(OLD_SHA), committedAt: "2026-10-22T00:00:00Z", subject: "Previous" }
    ])
  ),
  listTree: vi.fn(() => {
    const file = createRelativeGitPath("src/Main.java");
    if (file === null) throw new Error("Invalid test path");
    return Promise.resolve([
      { path: file, objectId: objectId(SHA), mode: "100644", objectType: "blob" as const }
    ]);
  }),
  readRevisionFile: vi.fn(() => Promise.resolve("source"))
});

describe("canonical review context adapter", () => {
  it("uses canonical manifest mapping and roster IDs with one read and no save", () => {
    const loadState = vi.fn(() => ({ status: "missing" as const }));
    const result = createReviewImportContext(request(), loadState);
    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("Expected context");
    expect(result.context.submissions[0]).toMatchObject({
      student: { studentId: "jones", githubUsername: "seanjones" },
      repository: { owner: "example-org", name: "27s1-se2030-lab04-seanjones" },
      currentCommitSha: SHA,
      gradingState: null
    });
    expect(loadState).toHaveBeenCalledOnce();
  });
  it("rejects manifest/assignment disagreement", () => {
    const input = request();
    expect(
      createReviewImportContext({
        ...input,
        manifest: {
          ...input.manifest,
          assignment: { ...input.manifest.assignment, assignmentSlug: "wrong" }
        }
      }).status
    ).toBe("invalid_context");
  });
  it("uses persisted canonical SHA and blocks state/HEAD disagreement", () => {
    const input = request();
    const loadState = () => ({ status: "success" as const, value: state() });
    const result = createReviewImportContext(
      { ...input, currentHeads: new Map([["jones", OLD_SHA]]) },
      loadState
    );
    expect(result).toMatchObject({
      status: "success",
      context: {
        submissions: [{ currentCommitSha: null, diagnostics: [{ code: "submission_changed" }] }]
      }
    });
    expect(
      createReviewImportContext({ ...input, currentHeads: new Map() }, loadState)
    ).toMatchObject({ status: "success", context: { submissions: [{ currentCommitSha: SHA }] } });
  });
  it("contains state corruption per student", () => {
    const result = createReviewImportContext(request(), () => ({
      status: "failure",
      code: "invalid_grading_state",
      message: "Secret local path"
    }));
    expect(result).toMatchObject({
      status: "success",
      context: {
        submissions: [{ currentCommitSha: null, diagnostics: [{ code: "grading_state_error" }] }]
      }
    });
    expect(JSON.stringify(result)).not.toContain("Secret local path");
  });
  it("does not guess missing or conflicting canonical mappings", () => {
    const input = request();
    const result = createReviewImportContext(
      { ...input, students: [{ studentId: "jones", githubUsername: "wrong" }] },
      () => ({ status: "missing" })
    );
    expect(result).toMatchObject({
      status: "success",
      context: { submissions: [{ repository: null }] }
    });
  });
  it("supports normalized v2 repository mappings", () => {
    const input = request();
    const result = createReviewImportContext(
      {
        ...input,
        manifest: {
          ...input.manifest,
          schemaVersion: 2,
          studentMappings: [
            {
              studentId: "jones",
              githubUsername: "seanjones",
              targetId: "jones",
              repositoryName: "repo"
            }
          ]
        }
      },
      () => ({ status: "missing" })
    );
    expect(result).toMatchObject({
      status: "success",
      context: {
        submissions: [
          { repository: { owner: input.config.course.github.organization, name: "repo" } }
        ]
      }
    });
  });
});

describe("read-only Git review repository adapter", () => {
  it.each([
    "https://github.com/example-org/repo.git",
    "git@github.com:example-org/repo.git",
    "ssh://git@github.com/example-org/repo.git"
  ])("verifies canonical origin %s", async (remote) => {
    const ws = workspace();
    ws.remoteUrl.mockResolvedValue(remote);
    expect(await createReviewRepositoryReader(ws).matchesRepository("Example-Org", "repo")).toBe(
      true
    );
  });
  it("rejects wrong remote and proves history membership", async () => {
    const ws = workspace();
    const reader = createReviewRepositoryReader(ws);
    expect(await reader.matchesRepository("other", "repo")).toBe(false);
    expect(await reader.isInHistory(SHA, SHA)).toBe(true);
    expect(ws.listCommits).not.toHaveBeenCalled();
    expect(await reader.isInHistory(OLD_SHA, SHA)).toBe(true);
    expect(await reader.isInHistory("c".repeat(SHA_LENGTH), SHA)).toBe(false);
  });
  it("does not claim unrelated history when the history bound is reached", async () => {
    const ws = workspace();
    ws.listCommits.mockResolvedValue(
      Array.from({ length: MAX_REVIEW_HISTORY_COMMITS }, () => ({
        id: objectId(SHA),
        committedAt: "2026-10-23T00:00:00Z",
        subject: "commit"
      }))
    );
    expect(await createReviewRepositoryReader(ws).isInHistory(OLD_SHA, SHA)).toBe(null);
  });
  it("contains inaccessible commits without fetching", async () => {
    const ws = workspace();
    ws.resolveRevision.mockRejectedValue(new Error("missing"));
    expect(await createReviewRepositoryReader(ws).isInHistory(OLD_SHA, SHA)).toBe(null);
    expect(ws.listCommits).not.toHaveBeenCalled();
  });
  it("reads only regular Git blobs and never follows symlinks or working-tree paths", async () => {
    const ws = workspace();
    const reader = createReviewRepositoryReader(ws);
    expect(await reader.readRevisionFile(SHA, "src/Main.java")).toBe("source");
    expect(await reader.readRevisionFile(SHA, "../secret")).toBe(null);
    expect(await reader.readRevisionFile(SHA, "missing.java")).toBe(null);
    const entry = (await ws.listTree())[0];
    if (entry === undefined) throw new Error("Missing tree entry");
    ws.listTree.mockResolvedValue([{ ...entry, mode: "120000" }]);
    expect(await reader.readRevisionFile(SHA, "src/Main.java")).toBe(null);
    expect(ws.readRevisionFile).toHaveBeenCalledOnce();
  });
});
