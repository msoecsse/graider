import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedGraiderConfig } from "../../../src/config/config-models.js";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { loadManifest } from "../../../src/manifest/manifest-loader.js";
import type { Manifest } from "../../../src/manifest/manifest-models.js";
import { createEmptyManifest } from "../../../src/manifest/manifest-updater.js";
import { resolveGradingWorkspaceContext } from "../../../src/grading/grading-workspace-context.js";
import { createGradingWorkspaceService } from "../../../ui/electron/gradingWorkspaceService.js";

vi.mock("../../../src/config/config-loader.js");
vi.mock("../../../src/manifest/manifest-loader.js");
vi.mock("../../../src/grading/grading-state.js", () => ({
  loadGradingState: vi.fn(() => ({ status: "missing" }))
}));

const REQUEST = {
  courseFolderPath: "course",
  userDataPath: "user-data",
  termCode: "27s1",
  assignmentSlug: "lab1"
};
const URL = "https://github.com/course/custom-recorded-repo";
const STUDENTS = ["ada", "grace"].map((studentId) => ({
  studentId,
  githubUsername: `${studentId}-gh`,
  section: "001"
}));

const manifest = (): Manifest => ({
  ...createEmptyManifest({
    assignment: {
      termCode: "27s1",
      courseCode: "CS101",
      assignmentSlug: "lab1",
      assignmentTitle: "Lab 1"
    },
    source: { sourceFiles: [], inputFingerprint: "fingerprint" }
  }),
  repositories: [
    {
      studentId: "ada",
      githubUsername: "ada-gh",
      section: "001",
      rosterStatus: "active",
      repository: {
        owner: "course",
        name: "custom-recorded-repo",
        fullName: "course/custom-recorded-repo",
        htmlUrl: URL,
        createdFromTemplate: false
      },
      permissions: {},
      actions: { enabled: true },
      lifecycle: { repositoryArchived: false, studentAccessRemoved: false, status: "active" },
      warnings: [],
      errors: []
    }
  ]
});
const useManifest = (value: Manifest) => {
  vi.mocked(loadManifest).mockReturnValue({
    status: "loaded",
    manifest: value,
    warnings: [],
    errors: []
  });
};
const prepare = () =>
  createGradingWorkspaceService({
    resolveFacultyScope: () => ({
      status: "success",
      students: STUDENTS,
      sections: ["001"],
      errors: []
    }),
    backend: { resolveGradingWorkspaceContext }
  })(REQUEST);

beforeEach(() => {
  vi.mocked(loadGraiderConfig).mockReturnValue({
    status: "success",
    config: {
      summary: { repoRoot: "course", termCode: "27s1", assignmentSlug: "lab1" },
      assignment: { assignment: { title: "Lab 1" } }
    } as unknown as LoadedGraiderConfig,
    diagnostics: []
  });
  useManifest(manifest());
});

describe("grading workspace recorded repository links", () => {
  it("returns only the faculty-scoped student's recorded URL without inventing a missing repository", () => {
    const result = prepare();
    expect(result).toMatchObject({
      status: "success",
      students: [
        { studentId: "ada", repositoryUrl: URL },
        { studentId: "grace", gradingStatus: "not_started" }
      ]
    });
    if (result.status !== "success") throw new Error("Workspace unavailable");
    expect(result.students[1]).not.toHaveProperty("repositoryUrl");
    expect(loadManifest).toHaveBeenCalledOnce();
  });

  it("uses the existing group mapping for both members, rather than synthesizing individual repositories", () => {
    const group = manifest();
    group.schemaVersion = 2;
    group.repositoryMode = "group";
    group.repositories = [];
    group.targets = [
      {
        targetId: "group-1",
        mode: "group",
        groupId: "group-1",
        repositoryName: "custom-recorded-repo",
        htmlUrl: URL,
        sectionIds: ["001"],
        studentIds: ["ada", "grace"],
        githubUsernames: ["ada-gh", "grace-gh"],
        diagnostics: []
      }
    ];
    group.studentMappings = STUDENTS.map((student) => ({
      ...student,
      targetId: "group-1",
      repositoryName: "custom-recorded-repo",
      htmlUrl: URL
    }));
    // V2 loader intentionally has no assignment identity; the manifest path scopes it.
    group.assignment = { termCode: "", assignmentSlug: "", assignmentTitle: "", courseCode: "" };
    useManifest(group);
    expect(prepare()).toMatchObject({
      status: "success",
      students: [
        { studentId: "ada", repositoryUrl: URL },
        { studentId: "grace", repositoryUrl: URL }
      ]
    });
  });

  it.each(["missing", "failure"] as const)(
    "keeps grading usable when manifest loading returns %s",
    (status) => {
      vi.mocked(loadManifest).mockReturnValue({ status, warnings: [], errors: [] });
      const result = prepare();
      expect(result.status).toBe("success");
      expect(JSON.stringify(result)).not.toContain("repositoryUrl");
    }
  );

  it.each(["missing", "error"] as const)("omits a repository recorded as %s", (status) => {
    const value = manifest();
    value.repositories.forEach((record) => {
      record.lifecycle.status = status;
    });
    useManifest(value);
    expect(JSON.stringify(prepare())).not.toContain("repositoryUrl");
  });

  it.each([
    "javascript:alert(1)",
    "https://github.com.evil.test/course/repo",
    "https://user@github.com/course/repo"
  ])("omits an unsafe URL: %s", (url) => {
    const value = manifest();
    value.repositories.forEach((record) => {
      record.repository.htmlUrl = url;
    });
    useManifest(value);
    expect(JSON.stringify(prepare())).not.toContain("repositoryUrl");
  });

  it("does not expose repositories outside faculty scope", () => {
    const result = createGradingWorkspaceService({
      resolveFacultyScope: () => ({
        status: "no_assigned_sections",
        students: [],
        sections: [],
        errors: []
      }),
      backend: { resolveGradingWorkspaceContext }
    })(REQUEST);
    expect(result).toEqual({ status: "no_assigned_sections" });
    expect(loadManifest).not.toHaveBeenCalled();
  });

  it("omits metadata belonging to a different legacy assignment", () => {
    const value = manifest();
    value.assignment.assignmentSlug = "other";
    useManifest(value);
    expect(JSON.stringify(prepare())).not.toContain("repositoryUrl");
  });
});
