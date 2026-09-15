import { describe, expect, it } from "vitest";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type { Manifest } from "../../../src/manifest/manifest-models.js";
import type { ProductionAssignmentTemplateSyncBridgeInput } from "../../../src/template-sync/production-assignment-template-sync-bridge.js";
import { runProductionAssignmentTemplateSync } from "../../../src/template-sync/production-assignment-template-sync-bridge.js";

type Executor = NonNullable<ProductionAssignmentTemplateSyncBridgeInput["executor"]>;

const manifest: Manifest = {
  schemaVersion: 2,
  assignment: {
    termCode: "27s1",
    courseCode: "se2030",
    assignmentSlug: "lab04",
    assignmentTitle: "Lab 04"
  },
  source: { sourceFiles: [], inputFingerprint: "fingerprint" },
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
      actions: { enabled: true },
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
    const calls: Parameters<Executor>[] = [];
    const executor: Executor = (...args) => {
      calls.push(args);
      return Promise.resolve({ result: { status: "already_current" } });
    };
    const result = await runProductionAssignmentTemplateSync({
      manifest,
      options: { yes: true, json: false, verbose: false },
      resolveCurrentTemplateCommitSha: () => Promise.resolve("next"),
      persistManifest: () => Promise.resolve(undefined),
      token: "secret",
      templateCloneUrl: "https://github.com/course/template.git",
      workspace: { githubClient: new FakeGitHubClient() },
      executor
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject([
      expect.anything(),
      "next",
      {
        token: "secret",
        templateCloneUrl: "https://github.com/course/template.git",
        studentCloneUrl: "git@github.com:course/student.git"
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
