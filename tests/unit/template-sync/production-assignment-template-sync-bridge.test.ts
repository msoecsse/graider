import { describe, expect, it } from "vitest";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type { Manifest } from "../../../src/manifest/manifest-models.js";
import {
  runProductionAssignmentTemplateSync,
  type ProductionAssignmentTemplateSyncBridgeInput
} from "../../../src/template-sync/production-assignment-template-sync-bridge.js";

const manifest: Manifest = {
  schemaVersion: 1,
  assignment: { termCode: "27s1", courseCode: "CS", assignmentSlug: "lab", assignmentTitle: "Lab" },
  source: { sourceFiles: [], inputFingerprint: "source" },
  template: { repository: "course/template", branch: "main" },
  repositories: [
    {
      studentId: "123",
      githubUsername: "student",
      section: "001",
      rosterStatus: "active",
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
      permissions: {},
      actions: { enabled: false },
      lifecycle: { repositoryArchived: false, studentAccessRemoved: false, status: "active" },
      warnings: [],
      errors: []
    }
  ],
  operationHistory: [],
  warnings: [],
  errors: []
};

describe("production assignment template-sync bridge", () => {
  it("passes injected token and clone URLs only to the repository executor", async () => {
    type Executor = NonNullable<ProductionAssignmentTemplateSyncBridgeInput["executor"]>;
    const calls: Parameters<Executor>[] = [];
    const executor: Executor = (...args) => {
      calls.push(args);
      return Promise.resolve({ result: { status: "already_current" } });
    };
    const result = await runProductionAssignmentTemplateSync({
      manifest,
      options: { yes: true, json: false, verbose: false },
      resolveCurrentTemplateCommitSha: () => Promise.resolve("next"),
      persistManifest: () => Promise.resolve(),
      token: "secret",
      templateCloneUrl: "https://github.com/course/template.git",
      workspace: { githubClient: new FakeGitHubClient() },
      executor
    });
    const [call] = calls;
    if (call === undefined) throw new Error("Expected repository executor invocation.");
    const [repository, targetTemplateCommitSha, workspace] = call;
    expect(repository.repository.fullName).toBe("course/student");
    expect(targetTemplateCommitSha).toBe("next");
    expect(workspace).toMatchObject({
      token: "secret",
      templateCloneUrl: "https://github.com/course/template.git",
      studentCloneUrl: "https://github.com/course/student.git"
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
