import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runApplyCommand } from "../../src/cli/commands/apply.command.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import { DEFAULT_GITHUB_RETRY_ATTEMPTS } from "../../src/github/github-retry.js";
import type {
  GitHubRepository,
  GitHubTemplateRepository,
  GitHubWorkflow
} from "../../src/github/github-models.js";
import { loadManifest } from "../../src/manifest/manifest-loader.js";
import { createManifestPath } from "../../src/manifest/manifest-paths.js";
import { writeManifest } from "../../src/manifest/manifest-renderer.js";
import {
  createEmptyManifest,
  upsertRepositoryRecord
} from "../../src/manifest/manifest-updater.js";

enum TestNumber {
  TemplateRepositoryId = 101,
  ExistingRepositoryId = 202,
  WorkflowId = 303
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/apply");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const APPLY_TIMESTAMP = "2026-09-01T14:30:00.000Z";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const PATEL_REPOSITORY = "27s1-se2030-lab04-mayapatel";

const yesOptions = normalizeCommonCommandOptions({ yes: true });
const noOptions = normalizeCommonCommandOptions({});
const jsonYesOptions = normalizeCommonCommandOptions({ json: true, yes: true });
const fixedClock = {
  now: () => new Date(APPLY_TIMESTAMP)
};

const templateRepository: GitHubTemplateRepository = {
  owner: ORGANIZATION,
  name: TEMPLATE_REPO,
  fullName: `${ORGANIZATION}/${TEMPLATE_REPO}`,
  id: TestNumber.TemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${TEMPLATE_REPO}`,
  isTemplate: true,
  branches: [TEMPLATE_BRANCH],
  files: [README_FILE],
  latestCommitSha: "template-sha"
};

const gradingWorkflow: GitHubWorkflow = {
  id: TestNumber.WorkflowId,
  path: "grade.yml",
  name: "Grade",
  supportsDispatch: true
};

const copyFixtureToTemp = (fixtureName: string): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graider-apply-${fixtureName}-`));

  fs.cpSync(sourceRoot, destinationRoot, {
    recursive: true
  });

  return destinationRoot;
};

const createRepository = (
  name: string,
  id: number = TestNumber.ExistingRepositoryId
): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const createReadyClient = (repositories: GitHubRepository[] = []): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository],
    repositories,
    users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
    teams: [
      { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
      { org: ORGANIZATION, slug: "graders", name: "Graders" }
    ],
    workflows: [JONES_REPOSITORY, PATEL_REPOSITORY].map((repo) => ({
      owner: ORGANIZATION,
      repo,
      workflow: gradingWorkflow
    }))
  });

class NonPersistingCreateGitHubClient extends FakeGitHubClient {
  override createRepositoryFromTemplate(
    input: Parameters<FakeGitHubClient["createRepositoryFromTemplate"]>[0]
  ): Promise<GitHubRepository> {
    const repository = createRepository(input.name);

    this.mutations.createdRepositories.push({
      input,
      repository
    });

    return Promise.resolve(repository);
  }
}

class NoWorkflowReadinessGitHubClient extends FakeGitHubClient {
  override getWorkflow(): Promise<GitHubWorkflow | null> {
    throw new Error("No-grading apply must not check grading workflows.");
  }
}

const runApply = async (
  fixtureName: string,
  githubClient: FakeGitHubClient = createReadyClient(),
  options = yesOptions
) => {
  const cwd = copyFixtureToTemp(fixtureName);
  const result = await runApplyCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options,
    githubClient,
    clock: fixedClock,
    retryOptions: { sleep: async () => {} }
  });

  return {
    cwd,
    result,
    githubClient
  };
};

const loadWrittenManifest = (cwd: string) => {
  const manifestPath = createManifestPath(cwd, "27s1", "lab04");

  return loadManifest(manifestPath.absolutePath);
};

const writeTrackedManifest = (cwd: string, repositoryName: string): void => {
  const manifestPath = createManifestPath(cwd, "27s1", "lab04");
  const manifest = upsertRepositoryRecord(
    createEmptyManifest({
      assignment: {
        termCode: "27s1",
        courseCode: "se2030",
        assignmentSlug: "lab04",
        assignmentTitle: "Lab 04"
      },
      source: {
        sourceFiles: [],
        inputFingerprint: "existing-fingerprint"
      },
      template: {
        repository: "example-org/lab04-template",
        branch: "main",
        commitSha: "template-sha"
      }
    }),
    {
      studentId: "jones",
      githubUsername: "seanjones",
      section: "001",
      rosterStatus: "active",
      repository: {
        owner: ORGANIZATION,
        name: repositoryName,
        fullName: `${ORGANIZATION}/${repositoryName}`,
        htmlUrl: `https://github.com/${ORGANIZATION}/${repositoryName}`,
        createdFromTemplate: true,
        templateRepository: "example-org/lab04-template",
        templateCommitSha: "template-sha"
      },
      permissions: {},
      actions: {
        enabled: false
      },
      lifecycle: {
        repositoryArchived: false,
        studentAccessRemoved: false,
        status: "created"
      },
      warnings: [],
      errors: []
    }
  );

  writeManifest(manifestPath.absolutePath, manifest);
};

describe("graider apply command", () => {
  it("uses the production GitHub client path unless a fake client is injected", async () => {
    vi.stubEnv("GRAIDER_GITHUB_TOKEN", "");
    vi.stubEnv("GITHUB_TOKEN", "");

    try {
      const cwd = copyFixtureToTemp("grading-disabled");
      const result = await runApplyCommand({
        cwd,
        assignmentFile: ASSIGNMENT_FILE,
        options: yesOptions,
        clock: fixedClock,
        retryOptions: { sleep: async () => {} }
      });
      const manifestResult = loadWrittenManifest(cwd);

      expect(result.exitCode).toBe(ExitCode.CommandError);
      expect(result.errors).toEqual([
        expect.objectContaining({
          code: "github_token_required"
        })
      ]);
      expect(manifestResult.status).toBe("missing");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("TC-CLI-APPLY-001 active assignment creates expected repos", async () => {
    const { cwd, result, githubClient } = await runApply("active-assignment");
    const manifestResult = loadWrittenManifest(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "grading_workflow_missing" })])
    );
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "grading_workflow_pending" })])
    );
    expect(
      manifestResult.manifest?.repositories.some(
        (repository) => repository.actions.gradingWorkflowFound === true
      )
    ).toBe(true);
    expect(
      githubClient.mutations.createdRepositories.map((record) => record.repository.name)
    ).toEqual([JONES_REPOSITORY, PATEL_REPOSITORY]);
    expect(githubClient.mutations.fileWrites).toEqual([]);
    expect(githubClient.mutations.workflowDispatches).toEqual([]);
    expect(result.summary.repositories).toEqual([
      expect.objectContaining({
        repository: JONES_REPOSITORY,
        status: "created"
      }),
      expect.objectContaining({
        repository: PATEL_REPOSITORY,
        status: "created"
      })
    ]);
  });

  it("TC-CLI-APPLY-002 re-running apply is no-op for existing state", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const githubClient = createReadyClient();
    const first = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });
    const createdAfterFirstRun = githubClient.mutations.createdRepositories.length;
    const second = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });

    expect(first.exitCode).toBe(ExitCode.Success);
    expect(second.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toHaveLength(createdAfterFirstRun);
    expect(second.summary.created).toBe(0);
    expect(typeof second.summary.noop).toBe("number");
    expect(second.summary.noop).toBeGreaterThan(0);
  });

  it("TC-CLI-APPLY-003 blocked plan prevents all GitHub mutations", async () => {
    const githubClient = createReadyClient([createRepository(JONES_REPOSITORY)]);
    const { result } = await runApply("grading-disabled", githubClient);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "repo_name_collision" })])
    );
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
    expect(githubClient.mutations.enabledActions).toEqual([]);
  });

  it("TC-CLI-APPLY-004 closed assignment repairs existing manifest-tracked repos only", async () => {
    const cwd = copyFixtureToTemp("closed-assignment");
    writeTrackedManifest(cwd, JONES_REPOSITORY);
    const githubClient = createReadyClient([createRepository(JONES_REPOSITORY)]);
    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([
      expect.objectContaining({
        repo: JONES_REPOSITORY,
        username: "seanjones",
        permission: "admin"
      })
    ]);
  });

  it("TC-CLI-APPLY-005 draft assignment blocks apply", async () => {
    const { result, githubClient } = await runApply("draft-assignment");

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "assignment_not_active" })])
    );
    expect(githubClient.mutations.createdRepositories).toEqual([]);
  });

  it("TC-CLI-APPLY-006 archived assignment blocks apply", async () => {
    const { result, githubClient } = await runApply("archived-assignment");

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "assignment_archived" })])
    );
    expect(githubClient.mutations.createdRepositories).toEqual([]);
  });

  it("TC-CLI-APPLY-007 manifest is updated incrementally", async () => {
    const githubClient = createReadyClient();
    githubClient.failTimes("addCollaborator", "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS);
    const { cwd, result } = await runApply("grading-disabled", githubClient);
    const manifestResult = loadWrittenManifest(cwd);

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(manifestResult.status).toBe("loaded");
    expect(manifestResult.manifest?.repositories[0]?.studentId).toBe("jones");
    expect(manifestResult.manifest?.repositories[0]?.repository.name).toBe(JONES_REPOSITORY);
  });

  it("repository creation retries a transient API failure and succeeds", async () => {
    const githubClient = createReadyClient();
    githubClient.failNext("createRepositoryFromTemplate", "api_error");

    const { result } = await runApply("grading-disabled", githubClient);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toHaveLength(1);
    expect(result.summary.retryCount).toBe(1);
  });

  it("collaborator add retries a transient network failure and succeeds", async () => {
    const githubClient = createReadyClient();
    githubClient.failNext("addCollaborator", "network_error");

    const { result } = await runApply("grading-disabled", githubClient);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.addedCollaborators).toHaveLength(1);
    expect(result.summary.retryDiagnostics).toEqual(["github_network_error"]);
  });

  it("exhausted GitHub API retry produces a structured diagnostic", async () => {
    const githubClient = createReadyClient();
    githubClient.failTimes(
      "createRepositoryFromTemplate",
      "api_error",
      DEFAULT_GITHUB_RETRY_ATTEMPTS
    );

    const { result } = await runApply("grading-disabled", githubClient);

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "github_api_error" })])
    );
  });

  it("does not write a manifest repository record when repository creation is not observable", async () => {
    const githubClient = new NonPersistingCreateGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
      teams: [
        { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
        { org: ORGANIZATION, slug: "graders", name: "Graders" }
      ]
    });
    const { cwd, result } = await runApply("active-assignment", githubClient);
    const manifestResult = loadWrittenManifest(cwd);

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(result.errors.map((error) => error.code)).toEqual([
      "github_api_error",
      "github_api_error"
    ]);
    expect(result.errors.map((error) => error.context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "createRepositoryFromTemplate",
          repositoryName: JONES_REPOSITORY
        }),
        expect.objectContaining({
          operation: "createRepositoryFromTemplate",
          repositoryName: PATEL_REPOSITORY
        })
      ])
    );
    expect(result.errors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "grading_workflow_missing" }),
        expect.objectContaining({ code: "workflow_dispatch_unsupported" })
      ])
    );
    if (manifestResult.status === "loaded") {
      expect(manifestResult.manifest.repositories).toEqual([]);
    } else {
      expect(manifestResult.status).toBe("missing");
    }
  });

  it("TC-CLI-APPLY-008 confirmation required unless --yes", async () => {
    const { result, githubClient } = await runApply(
      "grading-disabled",
      createReadyClient(),
      noOptions
    );

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([expect.objectContaining({ code: "confirmation_required" })]);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
  });

  it("TC-CLI-APPLY-009 non-interactive apply without --yes fails before mutations", async () => {
    const githubClient = createReadyClient();
    const { result } = await runApply("active-assignment", githubClient, noOptions);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
  });

  it("TC-CLI-APPLY-010 ignores extra collaborator accounts while preserving required access", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    writeTrackedManifest(cwd, JONES_REPOSITORY);
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository],
      repositories: [createRepository(JONES_REPOSITORY)],
      users: [{ username: "seanjones" }],
      teams: [
        { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
        { org: ORGANIZATION, slug: "graders", name: "Graders" }
      ],
      collaboratorPermissions: [
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          username: "seanjones",
          permission: "admin"
        },
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          username: "observer",
          permission: "pull"
        },
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          username: "organization-automation",
          permission: "maintain"
        }
      ]
    });
    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.warnings).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.removedCollaborators).toEqual([]);
  });

  it("apply --json output is parseable and includes manifest generated file path", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonYesOptions,
      githubClient: createReadyClient(),
      clock: fixedClock
    });
    const json = JSON.parse(formatCommandResultAsJson(result)) as {
      readonly generatedFiles: string[];
      readonly summary: { readonly manifestFile?: string };
    };

    expect(json.generatedFiles).toContain(json.summary.manifestFile);
  });

  it("manifest YAML is parseable after successful apply", async () => {
    const { cwd } = await runApply("grading-disabled");

    expect(loadWrittenManifest(cwd).status).toBe("loaded");
  });

  it("apply does not call destructive fake client methods", async () => {
    const { githubClient } = await runApply("grading-disabled");

    expect(githubClient.mutations.removedCollaborators).toEqual([]);
    expect(githubClient.mutations.archivedRepositories).toEqual([]);
    expect(githubClient.mutations.fileWrites).toEqual([]);
  });

  it("grading disabled skips workflow verification operations", async () => {
    const { result } = await runApply("grading-disabled");

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(typeof result.summary.skipped).toBe("number");
    expect(result.summary.skipped).toBeGreaterThan(0);
  });

  it("grading disabled applies repository setup without workflow readiness checks", async () => {
    const githubClient = new NoWorkflowReadinessGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
      teams: [
        { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
        { org: ORGANIZATION, slug: "graders", name: "Graders" }
      ]
    });
    const { cwd, result } = await runApply("grading-disabled", githubClient);
    const manifestResult = loadWrittenManifest(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "grading_workflow_missing" }),
        expect.objectContaining({ code: "workflow_dispatch_unsupported" })
      ])
    );
    expect(
      githubClient.mutations.createdRepositories.map((record) => record.repository.name)
    ).toEqual([JONES_REPOSITORY]);
    expect(manifestResult.status).toBe("loaded");
    expect(manifestResult.manifest?.repositories[0]?.actions.gradingWorkflowFound).toBeUndefined();
    expect(
      manifestResult.manifest?.repositories[0]?.actions.workflowDispatchSupported
    ).toBeUndefined();
  });

  it("new repositories with a workflow not yet observable omit the transient diagnostic", async () => {
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
      teams: [
        { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
        { org: ORGANIZATION, slug: "graders", name: "Graders" }
      ],
      workflows: [
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          workflow: gradingWorkflow
        }
      ]
    });
    const { result } = await runApply("active-assignment", githubClient);

    expect(result.status).toBe("success");
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "grading_workflow_pending" })])
    );
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "grading_workflow_pending" })])
    );
  });

  it("auth failure exits 3", async () => {
    const githubClient = createReadyClient();
    githubClient.failNext("getAuthenticatedUser", "auth_failed");
    const { result } = await runApply("grading-disabled", githubClient);

    expect(result.exitCode).toBe(ExitCode.AuthenticationOrAuthorizationFailure);
  });
});
