import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runAssignmentDownloadRepositoriesCommand } from "../../src/cli/commands/assignment.command.js";
import {
  createGitAuthenticationContext,
  type CloneRequest,
  type GitWorkspaceReader
} from "../../src/git/git-workspace.js";
import type { GitCredentialResolver } from "../../src/git/git-credential-resolver.js";

const SECRET = "download-distinctive-fake-secret";
const ASSIGNMENT = "terms/27s1/assignments/lab04/assignment.yml";

describe("assignment download authentication", () => {
  it.each([
    { GRAIDER_GITHUB_TOKEN: SECRET },
    { GITHUB_TOKEN: SECRET },
    { GRAIDER_GITHUB_TOKEN: SECRET, GITHUB_TOKEN: "lower-priority" }
  ])("composes operation authentication from the command environment", async (env) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graider-download-auth-"));
    fs.cpSync("tests/fixtures/grade/active-assignment", cwd, { recursive: true });
    const clone = vi
      .fn<(request: CloneRequest) => Promise<GitWorkspaceReader>>()
      .mockResolvedValue({ root: "/downloaded" } as GitWorkspaceReader);
    let resolver: GitCredentialResolver | undefined;
    const result = await runAssignmentDownloadRepositoriesCommand({
      cwd,
      assignmentFile: ASSIGNMENT,
      options: { destination: path.join(cwd, "downloads"), json: true },
      env,
      dependencies: {
        createGitWorkspaceFactory: (value) => {
          resolver = value;
          return {
            clone,
            verifyAvailable: vi.fn().mockResolvedValue(undefined),
            inspect: vi.fn(),
            open: vi.fn()
          };
        }
      }
    });
    expect(result.status).toBe("success");
    const authentication = clone.mock.calls[0]?.[0].authentication;
    expect(authentication).toBeDefined();
    expect(clone.mock.calls).toHaveLength(4);
    for (const [request] of clone.mock.calls) {
      expect(request.authentication).toBe(authentication);
      expect(request.remote).not.toContain(SECRET);
    }
    if (authentication === undefined || resolver === undefined)
      throw new Error("Missing authentication composition");
    expect(await resolver.resolve(authentication)).toEqual({
      kind: "github_token",
      host: "github.com",
      token: SECRET
    });
    const other = createGitAuthenticationContext("other-operation");
    const duplicate = createGitAuthenticationContext(authentication.id);
    if (other === null || duplicate === null) throw new Error("Invalid test context");
    expect(await resolver.resolve(other)).toBeNull();
    expect(await resolver.resolve(duplicate)).toBeNull();
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result.diagnostics)).not.toContain(SECRET);
  });

  it("fails safely without invoking the Git factory when tokens are unavailable", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graider-download-auth-"));
    fs.cpSync("tests/fixtures/grade/active-assignment", cwd, { recursive: true });
    const createGitWorkspaceFactory = vi.fn();
    const result = await runAssignmentDownloadRepositoriesCommand({
      cwd,
      assignmentFile: ASSIGNMENT,
      options: { destination: path.join(cwd, "downloads") },
      env: {},
      dependencies: { createGitWorkspaceFactory }
    });
    expect(result).toMatchObject({
      status: "failure",
      exitCode: 1,
      targets: [],
      diagnostics: [{ code: "github_auth_missing" }]
    });
    expect(createGitWorkspaceFactory).not.toHaveBeenCalled();
  });
});
