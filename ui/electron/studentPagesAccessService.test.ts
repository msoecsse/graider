import { describe, expect, it, vi } from "vitest";
import type { StudentPagesAccessResult } from "./ipc";
import {
  createStudentPagesAccessService,
  getRosterStudentsForRemoval,
  withStudentPagesAccess
} from "./studentPagesAccessService";

const synced: StudentPagesAccessResult = {
  status: "success",
  granted: ["ada"],
  removed: [],
  failedGithubUsernames: [],
  diagnostics: []
};

describe("studentPagesAccessService", () => {
  it("passes the resolved token to the backend and maps its result", async () => {
    const syncStudentPagesAccess = vi.fn(async () => ({
      status: "partial_failure" as const,
      granted: ["ada"],
      removed: ["dee"],
      failed: [{ githubUsername: "bob" }],
      diagnostics: ["Roster note."]
    }));
    const sync = createStudentPagesAccessService({
      resolveToken: async () => ({ status: "success" as const, token: "secret-token" }),
      loadBackend: () => ({ syncStudentPagesAccess })
    });

    const result = await sync("/course");

    expect(syncStudentPagesAccess).toHaveBeenCalledWith(
      { courseFolderPath: "/course" },
      "secret-token"
    );
    expect(result).toEqual({
      status: "partial_failure",
      granted: ["ada"],
      removed: ["dee"],
      failedGithubUsernames: ["bob"],
      diagnostics: [{ message: "Roster note." }]
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("reports unavailable GitHub sign-in without calling the backend", async () => {
    const loadBackend = vi.fn();
    const sync = createStudentPagesAccessService({
      resolveToken: async () => ({
        status: "failure" as const,
        error: {
          code: "github_token_required",
          message: "GitHub sign-in is required.",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        }
      }),
      loadBackend
    });

    const result = await sync("/course");

    expect(result.status).toBe("failure");
    expect(result.diagnostics).toEqual([
      {
        message:
          "GitHub sign-in is unavailable, so student access to the Pages site was not checked."
      }
    ]);
    expect(loadBackend).not.toHaveBeenCalled();
  });

  it("reports a backend error as a failed check", async () => {
    const sync = createStudentPagesAccessService({
      resolveToken: async () => ({ status: "success" as const, token: "secret-token" }),
      loadBackend: () => ({
        syncStudentPagesAccess: async () => {
          throw new Error("boom secret-token");
        }
      })
    });

    const result = await sync("/course");

    expect(result.diagnostics).toEqual([
      { message: "Unable to check student access to the Pages site." }
    ]);
  });

  it("checks access only after a successful save or Apply and keeps its status", async () => {
    const sync = vi.fn(async () => synced);

    expect(await withStudentPagesAccess("/course", { status: "failure" }, sync)).toEqual({
      status: "failure"
    });
    expect(sync).not.toHaveBeenCalled();
    expect(await withStudentPagesAccess("/course", { status: "success" }, sync)).toEqual({
      status: "success",
      pagesAccess: synced
    });
  });

  it("passes students from a removed roster to the backend", async () => {
    const syncStudentPagesAccess = vi.fn(async () => ({
      status: "success" as const,
      granted: [],
      removed: ["gone"],
      failed: [],
      diagnostics: []
    }));
    const sync = createStudentPagesAccessService({
      resolveToken: async () => ({ status: "success" as const, token: "secret-token" }),
      loadBackend: () => ({ syncStudentPagesAccess })
    });

    await sync("/course", { termCode: "27s1", githubUsernames: ["gone"] });

    expect(syncStudentPagesAccess).toHaveBeenCalledWith(
      {
        courseFolderPath: "/course",
        removedStudents: { termCode: "27s1", githubUsernames: ["gone"] }
      },
      "secret-token"
    );
  });

  it("reads a roster's GitHub usernames before removal, and none from an unreadable roster", () => {
    const request = {
      courseFolderId: "course",
      courseFolderPath: "/course",
      termCode: "27s1",
      sectionId: "001"
    };
    const roster = (status: "ready" | "invalid") => () => ({
      status,
      path: "terms/27s1/rosters/section-001.csv",
      exists: true,
      rows: [{ studentId: "ada", githubUsername: "ada-gh", section: "001", status: "active" }],
      faculty: [],
      diagnostics: []
    });

    expect(getRosterStudentsForRemoval(request, roster("ready"))).toEqual({
      termCode: "27s1",
      githubUsernames: ["ada-gh"]
    });
    expect(getRosterStudentsForRemoval(request, roster("invalid"))).toEqual({
      termCode: "27s1",
      githubUsernames: []
    });
  });
});
