import { describe, expect, it, vi } from "vitest";
import type { Manifest } from "../../../src/manifest/manifest-models.js";
import type { ProductionAssignmentTemplateSyncBridgeInput } from "../../../src/template-sync/production-assignment-template-sync-bridge.js";
import {
  runProductionAssignmentTemplateSyncService,
  type ProductionAssignmentTemplateSyncServiceInput
} from "../../../src/template-sync/production-assignment-template-sync-service.js";
import type { AssignmentTemplateSyncResult } from "../../../src/template-sync/assignment-template-sync.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";

type Bridge = NonNullable<ProductionAssignmentTemplateSyncServiceInput["bridge"]>;

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
  repositories: [],
  operationHistory: [],
  warnings: [],
  errors: []
};

const completed: AssignmentTemplateSyncResult = {
  status: "completed",
  templateCommitSha: "sha",
  outcomes: [],
  manifest
};

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
  persistManifest: () => Promise.resolve(undefined),
  workspace: { githubClient: new FakeGitHubClient() }
});

describe("production assignment template-sync service", () => {
  it("uses Graider token precedence and never returns it", async () => {
    const calls: ProductionAssignmentTemplateSyncBridgeInput[] = [];
    const result = await runProductionAssignmentTemplateSyncService({
      ...base(
        (input) => {
          calls.push(input);
          return Promise.resolve(completed);
        },
        { GRAIDER_GITHUB_TOKEN: "graider", GITHUB_TOKEN: "github" }
      )
    });
    expect(calls[0]).toMatchObject({
      token: "graider",
      templateCloneUrl: "git@github.com:course/template.git"
    });
    expect(JSON.stringify(result)).not.toContain("graider");
  });

  it("uses a token resolved by the trusted production caller and never returns it", async () => {
    const bridge = vi.fn<Bridge>(() => Promise.resolve(completed));
    const result = await runProductionAssignmentTemplateSyncService({
      ...base(bridge, { GRAIDER_GITHUB_TOKEN: " ", GITHUB_TOKEN: "" }),
      resolvedToken: " cli-secret "
    });

    expect(bridge).toHaveBeenCalledWith(expect.objectContaining({ token: "cli-secret" }));
    expect(JSON.stringify(result)).not.toContain("cli-secret");
  });

  it("preserves github_token_required when no authentication source is available", async () => {
    const bridge = vi.fn<Bridge>(() => Promise.resolve(completed));
    const result = await runProductionAssignmentTemplateSyncService({
      ...base(bridge, {})
    });

    expect(result).toMatchObject({ status: "failure", code: "github_token_required" });
    expect(bridge).not.toHaveBeenCalled();
  });

  it("uses environment fallback and blocks invalid prerequisites", async () => {
    const bridge: Bridge = () => Promise.resolve(completed);
    await expect(
      runProductionAssignmentTemplateSyncService(base(bridge, { GITHUB_TOKEN: "fallback" }))
    ).resolves.toMatchObject({ status: "success" });
    await expect(
      runProductionAssignmentTemplateSyncService({
        ...base(bridge, { GITHUB_TOKEN: " " })
      })
    ).resolves.toMatchObject({ status: "failure" });
    await expect(
      runProductionAssignmentTemplateSyncService({
        ...base(bridge, { GITHUB_TOKEN: "x" }),
        configuredTemplateRepository: "bad"
      })
    ).resolves.toMatchObject({ status: "failure" });
  });
});
