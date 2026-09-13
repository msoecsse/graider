import { describe, expect, it } from "vitest";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type { Manifest } from "../../../src/manifest/manifest-models.js";
import type { AssignmentTemplateSyncResult } from "../../../src/template-sync/assignment-template-sync.js";
import {
  runProductionAssignmentTemplateSyncService,
  type ProductionAssignmentTemplateSyncServiceInput
} from "../../../src/template-sync/production-assignment-template-sync-service.js";

const manifest: Manifest = {
  schemaVersion: 1,
  assignment: { termCode: "27s1", courseCode: "CS", assignmentSlug: "lab", assignmentTitle: "Lab" },
  source: { sourceFiles: [], inputFingerprint: "source" },
  repositories: [],
  operationHistory: [],
  warnings: [],
  errors: []
};

type Bridge = NonNullable<ProductionAssignmentTemplateSyncServiceInput["bridge"]>;

const completedResult = (): AssignmentTemplateSyncResult => ({
  status: "completed",
  templateCommitSha: "sha",
  manifest,
  outcomes: []
});

const base = (
  bridge: Bridge,
  env?: Record<string, string>
): ProductionAssignmentTemplateSyncServiceInput => ({
  configuredOrganization: "course",
  configuredTemplateRepository: "course/template",
  ...(env === undefined ? {} : { env }),
  bridge,
  manifest,
  options: { yes: true, json: false, verbose: false },
  resolveCurrentTemplateCommitSha: () => Promise.resolve("sha"),
  persistManifest: () => Promise.resolve(),
  workspace: { githubClient: new FakeGitHubClient() }
});

describe("production assignment template-sync service", () => {
  it("uses Graider token precedence and never returns it", async () => {
    const calls: Parameters<Bridge>[0][] = [];
    const bridge: Bridge = (input) => {
      calls.push(input);
      return Promise.resolve(completedResult());
    };
    const result = await runProductionAssignmentTemplateSyncService(
      base(bridge, { GRAIDER_GITHUB_TOKEN: "graider", GITHUB_TOKEN: "github" })
    );
    const [call] = calls;
    if (call === undefined) throw new Error("Expected bridge invocation.");
    expect(call.token).toBe("graider");
    expect(call.templateCloneUrl).toBe("https://github.com/course/template.git");
    expect(JSON.stringify(result)).not.toContain("graider");
  });

  it("uses a token resolved by the trusted production caller and never returns it", async () => {
    const calls: Parameters<Bridge>[0][] = [];
    const bridge: Bridge = (input) => {
      calls.push(input);
      return Promise.resolve(completedResult());
    };
    const result = await runProductionAssignmentTemplateSyncService({
      ...base(bridge, { GRAIDER_GITHUB_TOKEN: " ", GITHUB_TOKEN: "" }),
      resolvedToken: " cli-secret "
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.token).toBe("cli-secret");
    expect(JSON.stringify(result)).not.toContain("cli-secret");
  });

  it("preserves github_token_required when no authentication source is available", async () => {
    const bridge: Bridge = () => Promise.resolve(completedResult());
    const result = await runProductionAssignmentTemplateSyncService(base(bridge, {}));

    expect(result).toMatchObject({ status: "failure", code: "github_token_required" });
  });

  it("uses environment fallback and blocks invalid prerequisites", async () => {
    const bridge: Bridge = () => Promise.resolve(completedResult());
    await expect(
      runProductionAssignmentTemplateSyncService(base(bridge, { GITHUB_TOKEN: "fallback" }))
    ).resolves.toMatchObject({ status: "success" });
    await expect(
      runProductionAssignmentTemplateSyncService(base(bridge, { GITHUB_TOKEN: " " }))
    ).resolves.toMatchObject({ status: "failure" });
    await expect(
      runProductionAssignmentTemplateSyncService({
        ...base(bridge, { GITHUB_TOKEN: "x" }),
        configuredTemplateRepository: "bad"
      })
    ).resolves.toMatchObject({ status: "failure" });
  });
});
