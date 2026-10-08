import { describe, expect, it, vi } from "vitest";
import { runAssignmentRepositoryDownload } from "./assignmentRepositoryDownloadRunner.js";
import {
  createNodeProcessRunner,
  type ProcessRunRequest,
  type ProcessRunResult
} from "./commandRunner.js";

const SECRET = "electron-download-distinctive-fake-secret";
const request = {
  courseFolderId: "course",
  courseFolderPath: "/course",
  assignmentFile: "terms/27s1/assignments/lab04/assignment.yml",
  destination: "/downloads"
};
const success = { stdout: '{"targets":[]}', stderr: "", exitCode: 0, error: null };

describe("repository download launch authentication", () => {
  it("keeps tokens out of bundled command diagnostics and launch errors", async () => {
    const processRunner = createNodeProcessRunner({
      graiderCli: { mode: "bundled", appPath: "/nonexistent-graider-download-auth-test" }
    });
    let commandResult: ProcessRunResult | undefined;
    const runner = async (child: ProcessRunRequest): Promise<ProcessRunResult> => {
      commandResult = await processRunner(child);
      return commandResult;
    };
    await expect(
      runAssignmentRepositoryDownload(request, { runner, env: { GRAIDER_GITHUB_TOKEN: SECRET } })
    ).rejects.toThrow("Repository download command could not be started.");
    expect(commandResult?.diagnostic).toBeDefined();
    expect(JSON.stringify(commandResult?.diagnostic)).not.toContain(SECRET);
    expect(JSON.stringify(commandResult?.error)).not.toContain(SECRET);
  });
  it.each(["environment", "gh"])(
    "forwards %s tokens only in an isolated child environment",
    async (source) => {
      const parent = { ...process.env };
      const env = source === "environment" ? { GRAIDER_GITHUB_TOKEN: SECRET } : {};
      const original = { ...env };
      const runner = vi.fn(async (child: ProcessRunRequest) =>
        child.command === "gh" ? { ...success, stdout: SECRET } : success
      );
      expect(await runAssignmentRepositoryDownload(request, { runner, env })).toEqual({
        targets: []
      });
      const child = runner.mock.calls.find(([value]) => value.command === "graider")?.[0];
      expect(child?.env?.GRAIDER_GITHUB_TOKEN).toBe(SECRET);
      expect(child?.env).not.toBe(env);
      expect(JSON.stringify(child?.args)).not.toContain(SECRET);
      expect(env).toEqual(original);
      expect(process.env).toEqual(parent);
    }
  );

  it("returns a safe faculty auth error without launching download", async () => {
    const runner = vi.fn().mockResolvedValue({ ...success, exitCode: 1, stderr: SECRET });
    await expect(runAssignmentRepositoryDownload(request, { runner, env: {} })).rejects.toThrow(
      "Run gh auth login"
    );
    expect(runner.mock.calls.every(([value]) => value.command === "gh")).toBe(true);
    try {
      await runAssignmentRepositoryDownload(request, { runner, env: {} });
    } catch (error) {
      expect(String(error)).not.toContain(SECRET);
      expect(JSON.stringify(error)).not.toContain(SECRET);
    }
  });
});
