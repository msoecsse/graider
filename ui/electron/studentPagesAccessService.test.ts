import { describe, expect, it, vi } from "vitest";
import type { StudentPagesAccessResult } from "./ipc";
import {
  createStudentPagesAccessService,
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
});
