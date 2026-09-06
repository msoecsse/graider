import { describe, expect, it } from "vitest";
import { runProductionAssignmentTemplateSyncService } from "../../../src/template-sync/production-assignment-template-sync-service.js";

const base = (bridge: any, env?: Record<string, string>) => ({
  configuredOrganization: "course",
  configuredTemplateRepository: "course/template",
  env,
  bridge,
  manifest: {} as any,
  options: {} as any,
  resolveCurrentTemplateCommitSha: async () => "sha",
  persistManifest: async () => undefined,
  workspace: { githubClient: {} as any }
});
describe("production assignment template-sync service", () => {
  it("uses Graider token precedence and never returns it", async () => {
    const calls: any[] = [];
    const result = await runProductionAssignmentTemplateSyncService(
      base(
        async (input: any) => {
          calls.push(input);
          return { status: "completed" };
        },
        { GRAIDER_GITHUB_TOKEN: "graider", GITHUB_TOKEN: "github" }
      )
    );
    expect(calls[0]).toMatchObject({
      token: "graider",
      templateCloneUrl: "https://github.com/course/template.git"
    });
    expect(JSON.stringify(result)).not.toContain("graider");
  });
  it("uses fallback and blocks invalid prerequisites", async () => {
    const bridge = async () => ({ status: "completed" } as any);
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
