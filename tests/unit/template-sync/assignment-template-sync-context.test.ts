import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { loadManifest } from "../../../src/manifest/manifest-loader.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import {
  createAssignmentTemplateSyncContextService,
  type AssignmentTemplateSyncContextDependencies
} from "../../../src/template-sync/assignment-template-sync-context.js";

const credentials = { githubClient: new FakeGitHubClient(), transportToken: "resolved-token" };

const request = {
  courseFolderId: "course",
  courseFolderPath: path.resolve("tests/fixtures/grade/active-assignment"),
  assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
};

const setup = () => {
  const config = loadGraiderConfig({
    cwd: request.courseFolderPath,
    assignmentFile: request.assignmentFile
  });
  if (config.status !== "success") throw new Error("Invalid config fixture");
  const manifest = loadManifest(
    path.join(request.courseFolderPath, "terms/27s1/manifests/lab04/manifest.yml"),
    { required: true }
  );
  if (manifest.status !== "loaded") throw new Error("Invalid manifest fixture");
  const dependencies = {
    loadConfig: vi.fn(() => config),
    loadManifest: vi.fn(() => manifest),
    writeManifest: vi.fn(() => ({ status: "success" as const })),
    runSync: vi.fn<AssignmentTemplateSyncContextDependencies["runSync"]>(() =>
      Promise.resolve({
        status: "success" as const,
        result: {
          status: "completed" as const,
          templateCommitSha: "target",
          manifest: manifest.manifest,
          outcomes: []
        }
      })
    )
  };
  return {
    config,
    manifest,
    dependencies,
    service: createAssignmentTemplateSyncContextService(dependencies)
  };
};

describe("assignment template-sync main-process context", () => {
  it("resolves a selected student to the trusted manifest repository before executing", async () => {
    const { dependencies, service } = setup();

    await expect(service.prepare({ ...request, studentId: "jones" })).resolves.toMatchObject({
      available: true,
      repositoryCount: 1,
      selectedRepository: { studentId: "jones" }
    });
    await service.execute({ ...request, studentId: "jones", confirmed: true }, credentials);
    const [runSyncCall] = dependencies.runSync.mock.calls;
    if (runSyncCall === undefined) throw new Error("Expected selected template-sync invocation.");
    expect(runSyncCall[0]).toMatchObject({ studentId: "jones" });
  });

  it("blocks unknown selected students before token or sync work", async () => {
    const { dependencies, service } = setup();

    await expect(
      service.execute({ ...request, studentId: "unknown", confirmed: true }, credentials)
    ).resolves.toMatchObject({
      outcomes: [],
      blocker: { code: "student_repository_unavailable" }
    });
    expect(dependencies.runSync).not.toHaveBeenCalled();
  });

  it("uses canonical loaders and shared eligibility without constructing production dependencies", async () => {
    const { dependencies, service, manifest } = setup();
    const [firstRepository] = manifest.manifest.repositories;
    if (firstRepository === undefined)
      throw new Error("Fixture manifest must include a repository.");
    firstRepository.lifecycle.status = "archived";
    const result = await service.prepare(request);
    expect(result.available).toBe(true);
    expect(result.repositoryCount).toBe(manifest.manifest.repositories.length - 1);
    expect(result.templateRepository).toBe("example-org/lab04-template");
    expect(dependencies.loadConfig).toHaveBeenCalledWith({
      cwd: request.courseFolderPath,
      assignmentFile: request.assignmentFile
    });
    expect(dependencies.loadManifest).toHaveBeenCalledWith(
      path.join(request.courseFolderPath, "terms/27s1/manifests/lab04/manifest.yml"),
      { required: true }
    );
    expect(dependencies.runSync).not.toHaveBeenCalled();
    expect(dependencies.writeManifest).not.toHaveBeenCalled();
  });

  it("reports missing template without loading a manifest", async () => {
    const { config, service, dependencies } = setup();
    delete config.config.assignment.template;
    expect(await service.prepare(request)).toMatchObject({
      available: false,
      blocker: { code: "template_required" }
    });
    expect(dependencies.loadManifest).not.toHaveBeenCalled();
  });

  it("reports missing/unreadable manifests safely", async () => {
    const service = createAssignmentTemplateSyncContextService({
      ...setup().dependencies,
      loadManifest: () => ({ status: "missing", warnings: [], errors: [] })
    });
    expect(await service.prepare(request)).toMatchObject({
      available: false,
      blocker: { code: "manifest_required" }
    });
  });

  it("reports invalid assignment config and rejects paths outside the course", async () => {
    const { dependencies } = setup();
    const service = createAssignmentTemplateSyncContextService({
      ...dependencies,
      loadConfig: () => ({ status: "failure", diagnostics: [] })
    });
    expect(await service.prepare(request)).toMatchObject({ available: false });
    expect(
      await service.prepare({ ...request, assignmentFile: "../assignment.yml" })
    ).toMatchObject({ blocker: { code: "invalid_assignment" } });
  });

  it("enforces confirmation before context/dependency creation", async () => {
    const { dependencies, service } = setup();
    expect(await service.execute({ ...request, confirmed: false }, credentials)).toMatchObject({
      status: "failure",
      blocker: { code: "confirmation_required" }
    });
    expect(dependencies.loadConfig).not.toHaveBeenCalled();
    expect(dependencies.runSync).not.toHaveBeenCalled();
  });

  it("composes production inputs once and projects public results without internals", async () => {
    const { dependencies, service } = setup();
    const result = await service.execute({ ...request, confirmed: true }, credentials);
    expect(dependencies.runSync).toHaveBeenCalledTimes(1);
    const [runSyncCall] = dependencies.runSync.mock.calls;
    if (runSyncCall === undefined) throw new Error("Expected template-sync invocation.");
    const [input] = runSyncCall;
    expect(input.workspace.githubClient).toBe(credentials.githubClient);
    expect(input).toMatchObject({
      configuredOrganization: "example-org",
      configuredTemplateRepository: "example-org/lab04-template",
      resolvedToken: "resolved-token",
      options: { yes: true },
      workspace: { githubClient: credentials.githubClient }
    });
    const [firstRepository] = input.manifest.repositories;
    if (firstRepository === undefined) throw new Error("Expected manifest repository.");
    expect(firstRepository.studentId).toBe("jones");
    await input.persistManifest(input.manifest);
    expect(dependencies.writeManifest).toHaveBeenCalledExactlyOnceWith(
      path.join(request.courseFolderPath, "terms/27s1/manifests/lab04/manifest.yml"),
      input.manifest
    );
    const getTemplate = vi
      .spyOn(input.workspace.githubClient, "getTemplateRepository")
      .mockResolvedValue({
        owner: "example-org",
        name: "lab04-template",
        fullName: "example-org/lab04-template",
        id: 1,
        private: true,
        archived: false,
        defaultBranch: "main",
        htmlUrl: "https://github.com/example-org/lab04-template",
        isTemplate: true,
        branches: ["main"],
        files: [],
        latestCommitSha: "current-remote-sha"
      });
    await expect(input.resolveCurrentTemplateCommitSha()).resolves.toBe("current-remote-sha");
    expect(getTemplate).toHaveBeenCalledExactlyOnceWith("example-org", "lab04-template");
    expect(result).toEqual({ status: "success", outcomes: [] });
    expect(JSON.stringify(result)).not.toMatch(
      /manifest|githubUsername|workspace|token|githubClient/
    );
  });

  it("projects student IDs and PR links while withholding raw errors and batch state", async () => {
    const { dependencies, service, manifest } = setup();
    dependencies.runSync.mockResolvedValue({
      status: "success",
      result: {
        status: "completed_with_failures",
        templateCommitSha: "next",
        manifest: manifest.manifest,
        outcomes: [
          {
            studentId: "jones",
            repository: "example/repo",
            result: {
              status: "failure",
              error: new Error("secret-token /tmp/workspace"),
              failure: {
                stage: "push_failed",
                message: "Push to student repository was rejected."
              }
            }
          },
          {
            studentId: "smith",
            repository: "example/another",
            result: {
              status: "pull_request_pending",
              branchName: "graider/internal",
              templateCommitSha: "next",
              pullRequest: { number: 7, url: "https://github.com/example/another/pull/7" }
            }
          },
          {
            studentId: "legacy",
            repository: "example/legacy",
            result: {
              status: "baseline_required",
              reason: "no_reliable_match",
              message: "No exact historical match was found. Initialize the baseline manually."
            }
          }
        ]
      }
    });
    const result = await service.execute({ ...request, confirmed: true }, credentials);
    expect(result.status).toBe("partial_success");
    expect(result.outcomes).toMatchObject([
      {
        studentId: "jones",
        status: "failed",
        failureStage: "push_failed",
        message: "Push to student repository was rejected."
      },
      { studentId: "smith", status: "pull_request_pending", pullRequest: { number: 7 } },
      {
        studentId: "legacy",
        status: "baseline_required",
        message: "No exact historical match was found. Initialize the baseline manually."
      }
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /secret-token|workspace|graider\/internal|githubUsername|manifest/
    );
  });

  it("requires explicit trusted credentials and maps service failures safely", async () => {
    const { dependencies, service } = setup();
    expect(await service.execute({ ...request, confirmed: true })).toMatchObject({
      blocker: { code: "github_token_required" }
    });
    expect(dependencies.runSync).not.toHaveBeenCalled();
    dependencies.runSync.mockRejectedValueOnce(new Error("secret /tmp/workspace"));
    const result = await service.execute({ ...request, confirmed: true }, credentials);
    expect(result.status).toBe("failure");
    expect(JSON.stringify(result)).not.toMatch(/secret|workspace/);
  });

  it("blocks mismatched and unsupported manifests before production execution", async () => {
    const { manifest, service, dependencies } = setup();
    manifest.manifest.schemaVersion = 2;
    expect(await service.prepare(request)).toMatchObject({
      blocker: { code: "unsupported_manifest" }
    });
    manifest.manifest.schemaVersion = 1;
    manifest.manifest.assignment.assignmentSlug = "another";
    expect(await service.execute({ ...request, confirmed: true }, credentials)).toMatchObject({
      blocker: { code: "manifest_mismatch" }
    });
    expect(dependencies.runSync).not.toHaveBeenCalled();
  });
});
