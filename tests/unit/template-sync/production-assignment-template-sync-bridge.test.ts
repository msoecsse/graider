import { describe, expect, it } from "vitest";
import { runProductionAssignmentTemplateSync } from "../../../src/template-sync/production-assignment-template-sync-bridge.js";

describe("production assignment template-sync bridge", () => {
  it("passes injected token and clone URLs only to the repository executor", async () => {
    const calls: unknown[] = [];
    const manifest = {
      template: { repository: "course/template", branch: "main" },
      repositories: [
        {
          studentId: "123",
          repository: {
            owner: "course",
            name: "student",
            fullName: "course/student",
            createdFromTemplate: true,
            templateRepository: "course/template",
            templateCommitSha: "base",
            studentDefaultBranchCommitSha: "head",
            templateSyncBaselineStatus: "initialized"
          },
          lifecycle: { status: "active" }
        }
      ]
    } as any;
    const result = await runProductionAssignmentTemplateSync({
      manifest,
      options: { yes: true, json: false, verbose: false },
      resolveCurrentTemplateCommitSha: async () => "next",
      persistManifest: async () => undefined,
      token: "secret",
      templateCloneUrl: "https://github.com/course/template.git",
      workspace: { githubClient: {} as any },
      executor: async (...args: any[]) => {
        calls.push(args);
        return { result: { status: "already_current" } };
      }
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject([
      expect.anything(),
      "next",
      {
        token: "secret",
        templateCloneUrl: "https://github.com/course/template.git",
        studentCloneUrl: "https://github.com/course/student.git"
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
