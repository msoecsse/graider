import fs from "node:fs";
import { buildDashboard } from "../../src/dashboard/dashboard-builder.js";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  runAssignmentDetailCommand,
  runAssignmentApplyCommand
} from "../../src/cli/commands/assignment.command.js";
import { runApplyCommand } from "../../src/cli/commands/apply.command.js";
import { FRESH_REPOSITORY_ACTIONS_MAX_ATTEMPTS } from "../../src/execution/apply-executor.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { buildAssignmentGradePreview } from "../../src/grade-preview/grade-preview-builder.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import { OctokitGitHubClient } from "../../src/github/octokit-github-client.js";
import { GitHubClientError } from "../../src/github/github-errors.js";
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
import { renderJavaJunitCheckstyleWorkflow } from "../../src/workflows/java-junit-checkstyle-workflow.js";
import {
  GRAIDER_MANAGED_WORKFLOW_MARKER,
  GRAIDER_MANAGED_WORKFLOW_PATH
} from "../../src/workflows/managed-workflow-policy.js";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getRepositoryOutcomes = (result: {
  readonly summary: Readonly<Record<string, unknown>>;
}): readonly Record<string, unknown>[] => {
  const repositories = result.summary.repositories;
  return Array.isArray(repositories) ? repositories.filter(isRecord) : [];
};

const getOutcomeDiagnostics = (
  outcome: Readonly<Record<string, unknown>> | undefined
): readonly Record<string, unknown>[] => {
  const diagnostics = outcome?.diagnostics;
  return Array.isArray(diagnostics) ? diagnostics.filter(isRecord) : [];
};

const hasOutcomeDiagnostic = (
  outcome: Readonly<Record<string, unknown>> | undefined,
  code: string,
  expectedContext: Readonly<Record<string, unknown>>
): boolean =>
  getOutcomeDiagnostics(outcome).some((diagnostic) => {
    const context = diagnostic.context;
    return (
      diagnostic.code === code &&
      isRecord(context) &&
      Object.entries(expectedContext).every(([key, value]) => context[key] === value)
    );
  });

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

const removeAssignmentTemplate = (cwd: string): void => {
  const assignmentPath = path.join(cwd, ASSIGNMENT_FILE);
  const content = fs.readFileSync(assignmentPath, "utf8");
  fs.writeFileSync(
    assignmentPath,
    content.replace(/template:\n {2}repository: [^\n]+\n {2}branch: [^\n]+\n/u, ""),
    "utf8"
  );
};

const configureAssignmentPresetGrading = (cwd: string): void => {
  const assignmentPath = path.join(cwd, ASSIGNMENT_FILE);
  fs.appendFileSync(
    assignmentPath,
    [
      "grading:",
      "  enabled: true",
      "  mode: preset",
      "  preset: java-junit-checkstyle",
      `  workflow: ${GRAIDER_MANAGED_WORKFLOW_PATH}`,
      "  artifact: grading-results",
      "  result_file: results.json",
      ""
    ].join("\n"),
    "utf8"
  );
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
    teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }],
    workflows: [JONES_REPOSITORY, PATEL_REPOSITORY].map((repo) => ({
      owner: ORGANIZATION,
      repo,
      workflow: gradingWorkflow
    }))
  });

class CreateResponseOnlyGitHubClient extends FakeGitHubClient {
  getRepositoryCalls = 0;
  private creationCompleted = false;

  override createRepositoryFromTemplate(
    input: Parameters<FakeGitHubClient["createRepositoryFromTemplate"]>[0]
  ): Promise<GitHubRepository> {
    const repository = createRepository(input.name);

    this.mutations.createdRepositories.push({
      input,
      repository
    });
    this.creationCompleted = true;

    return Promise.resolve(repository);
  }

  override getRepository(
    owner: string,
    repo: string
  ): ReturnType<FakeGitHubClient["getRepository"]> {
    if (!this.creationCompleted) return super.getRepository(owner, repo);
    this.getRepositoryCalls += 1;
    return Promise.reject(new Error("Repository identity must come from the create response."));
  }
}

class ManifestCheckpointFailureGitHubClient extends FakeGitHubClient {
  constructor(
    private readonly manifestPath: string,
    state: ConstructorParameters<typeof FakeGitHubClient>[0]
  ) {
    super(state);
  }

  override async createRepositoryFromTemplate(
    input: Parameters<FakeGitHubClient["createRepositoryFromTemplate"]>[0]
  ): Promise<GitHubRepository> {
    const repository = await super.createRepositoryFromTemplate(input);
    fs.unlinkSync(this.manifestPath);
    fs.mkdirSync(this.manifestPath);
    return repository;
  }
}

class NoWorkflowReadinessGitHubClient extends FakeGitHubClient {
  override getWorkflow(): Promise<GitHubWorkflow | null> {
    throw new Error("No-grading apply must not check grading workflows.");
  }
}

class DelayedTemplateMaterializationGitHubClient extends FakeGitHubClient {
  manifestWasDurableBeforeBaselineLookup = false;

  constructor(
    private readonly manifestPath: string,
    state: ConstructorParameters<typeof FakeGitHubClient>[0]
  ) {
    super(state);
  }

  override getDefaultBranchCommitSha(owner: string, repo: string): Promise<string | undefined> {
    if (repo !== TEMPLATE_REPO) {
      const manifest = loadManifest(this.manifestPath);
      this.manifestWasDurableBeforeBaselineLookup =
        manifest.status === "loaded" &&
        manifest.manifest.repositories.some((record) => record.repository.name === repo);
      return Promise.resolve(undefined);
    }

    return super.getDefaultBranchCommitSha(owner, repo);
  }
}

class StudentWorkflowFailureGitHubClient extends FakeGitHubClient {
  override getWorkflow(
    owner: string,
    repo: string,
    workflowPath: string
  ): ReturnType<FakeGitHubClient["getWorkflow"]> {
    return repo === TEMPLATE_REPO
      ? super.getWorkflow(owner, repo, workflowPath)
      : Promise.reject(new GitHubClientError("api_error", "Mock student workflow failure."));
  }
}

class EventuallyMaterializedTemplateGitHubClient extends FakeGitHubClient {
  materializationReads = 0;

  override getDefaultBranchCommitSha(owner: string, repo: string): Promise<string | undefined> {
    if (repo !== TEMPLATE_REPO) {
      this.materializationReads += 1;
      if (this.materializationReads < 3) return Promise.resolve(undefined);
    }
    return super.getDefaultBranchCommitSha(owner, repo);
  }
}

class ActionsPropagationGitHubClient extends FakeGitHubClient {
  actionsStateReads = 0;

  override getActionsState(
    owner: string,
    repo: string
  ): ReturnType<FakeGitHubClient["getActionsState"]> {
    this.actionsStateReads += 1;
    return super.getActionsState(owner, repo);
  }
}

class UnverifiedGrantGitHubClient extends FakeGitHubClient {
  constructor(
    private readonly grant: "student" | "faculty" | "invitation",
    state: ConstructorParameters<typeof FakeGitHubClient>[0]
  ) {
    super(state);
  }

  override async addCollaborator(
    input: Parameters<FakeGitHubClient["addCollaborator"]>[0]
  ): ReturnType<FakeGitHubClient["addCollaborator"]> {
    if (this.grant === "student" || this.grant === "invitation")
      return {
        username: input.username,
        permission: input.permission,
        pendingInvite: this.grant === "invitation"
      };
    return super.addCollaborator(input);
  }

  override async addTeamPermission(
    input: Parameters<FakeGitHubClient["addTeamPermission"]>[0]
  ): Promise<void> {
    if (this.grant !== "faculty") await super.addTeamPermission(input);
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
  it.each([false, true])(
    "creates no grader state and preserves historical evidence only (legacy manifest: %s)",
    async (historical) => {
      const cwd = copyFixtureToTemp("grading-disabled");
      const coursePath = path.join(cwd, "course.yml");
      const originalCourse = fs.readFileSync(coursePath, "utf8");
      const manifestPath = createManifestPath(cwd, "27s1", "lab04").absolutePath;
      const legacyPermission = {
        teamSlug: "graders",
        permission: "maintain" as const,
        lastAppliedAt: "2025-01-01T00:00:00.000Z"
      };
      if (historical) {
        writeTrackedManifest(cwd, JONES_REPOSITORY);
        const loaded = loadManifest(manifestPath);
        if (loaded.status !== "loaded" || !loaded.manifest.repositories[0])
          throw new Error("Expected tracked manifest");
        loaded.manifest.repositories[0].permissions.graderTeam = legacyPermission;
        loaded.manifest.warnings.push({
          code: "grader_team_missing",
          severity: "warning",
          message: "Historical missing grader team"
        });
        expect(writeManifest(manifestPath, loaded.manifest).status).toBe("success");
      }
      const githubClient = createReadyClient(
        historical ? [createRepository(JONES_REPOSITORY)] : []
      );
      const result = await runApplyCommand({
        cwd,
        assignmentFile: ASSIGNMENT_FILE,
        options: yesOptions,
        githubClient,
        clock: fixedClock
      });
      expect(result.status).toBe("success");
      expect(githubClient.mutations.teamPermissions).toEqual([
        expect.objectContaining({ teamSlug: "faculty", permission: "admin" })
      ]);
      expect(githubClient.mutations.addedCollaborators).toEqual([
        expect.objectContaining({ username: "seanjones", permission: "admin" })
      ]);
      const loaded = loadManifest(manifestPath);
      if (loaded.status !== "loaded") throw new Error("Expected readable manifest");
      expect(loaded.manifest.repositories[0]?.permissions.graderTeam).toEqual(
        historical ? legacyPermission : undefined
      );
      expect(loaded.manifest.repositories[0]?.permissions.facultyTeam).toMatchObject({
        teamSlug: "faculty",
        permission: "admin"
      });
      if (!historical) expect(fs.readFileSync(manifestPath, "utf8")).not.toMatch(/grader/iu);
      expect(fs.readFileSync(coursePath, "utf8")).toBe(originalCourse);
    }
  );
  it("installs the managed workflow when a template-backed repository omits it", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    configureAssignmentPresetGrading(cwd);
    const githubClient = createReadyClient();

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toHaveLength(2);
    expect(githubClient.mutations.fileWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repo: JONES_REPOSITORY,
          path: GRAIDER_MANAGED_WORKFLOW_PATH
        }),
        expect.objectContaining({
          repo: PATEL_REPOSITORY,
          path: GRAIDER_MANAGED_WORKFLOW_PATH
        })
      ])
    );
  });

  it("installs the managed workflow in template-backed repositories when the template omits it", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    configureAssignmentPresetGrading(cwd);
    const githubClient = createReadyClient();

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toHaveLength(2);
    expect(githubClient.mutations.fileWrites).toHaveLength(2);
    expect(
      githubClient.mutations.fileWrites.every(
        (write) => write.path === GRAIDER_MANAGED_WORKFLOW_PATH
      )
    ).toBe(true);
  });

  it("deploys the canonical workflow as the first file in a template-free repository", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    removeAssignmentTemplate(cwd);
    configureAssignmentPresetGrading(cwd);
    const githubClient = createReadyClient();

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.createdRepositoriesWithoutTemplate).toHaveLength(2);
    expect(githubClient.mutations.fileWrites).toHaveLength(2);
    const jonesWorkflow = githubClient.mutations.fileWrites.find(
      (write) => write.repo === JONES_REPOSITORY
    );
    if (jonesWorkflow === undefined) throw new Error("Expected Jones workflow deployment.");
    expect(jonesWorkflow).toMatchObject({
      owner: ORGANIZATION,
      path: GRAIDER_MANAGED_WORKFLOW_PATH,
      message: "Configure Graider grading workflow"
    });
    expect(jonesWorkflow.content).toContain(GRAIDER_MANAGED_WORKFLOW_MARKER);
    expect(githubClient.mutations.fileWrites.every((write) => write.branch === undefined)).toBe(
      true
    );
  });

  it("converges an existing repository to a no-op after installing the managed workflow", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    removeAssignmentTemplate(cwd);
    configureAssignmentPresetGrading(cwd);
    const githubClient = createReadyClient();
    const request = {
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    };

    expect((await runApplyCommand(request)).exitCode).toBe(ExitCode.Success);
    const writesAfterFirstApply = githubClient.mutations.fileWrites.length;
    expect((await runApplyCommand(request)).exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.fileWrites).toHaveLength(writesAfterFirstApply);
    expect(githubClient.mutations.createdRepositoriesWithoutTemplate).toHaveLength(2);
  });

  it("preserves an unmanaged workflow and skips later verification for that student", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    removeAssignmentTemplate(cwd);
    configureAssignmentPresetGrading(cwd);
    const facultyWorkflow = "name: Faculty workflow\non: push\n";
    const client = new FakeGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }],
      workflows: [PATEL_REPOSITORY].map((repo) => ({
        owner: ORGANIZATION,
        repo,
        workflow: gradingWorkflow
      })),
      repositoryFiles: [
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          path: GRAIDER_MANAGED_WORKFLOW_PATH,
          content: facultyWorkflow,
          message: "Faculty workflow",
          commitSha: "faculty-sha"
        }
      ]
    });

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient: client,
      clock: fixedClock
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "workflow_deployment_conflict" })])
    );
    expect(client.mutations.fileWrites).toHaveLength(1);
    await expect(
      client.getRepositoryFileContent(
        ORGANIZATION,
        JONES_REPOSITORY,
        GRAIDER_MANAGED_WORKFLOW_PATH,
        "main"
      )
    ).resolves.toBe(facultyWorkflow);
    expect(client.workflowReads.filter((read) => read.repo === JONES_REPOSITORY)).toEqual([]);
  });

  it.each([
    ["legacy", runApplyCommand, false],
    ["assignment", runAssignmentApplyCommand, false],
    ["legacy with existing repository", runApplyCommand, true],
    ["assignment with existing repository", runAssignmentApplyCommand, true]
  ] as const)(
    "%s retains failed workflow setup and recovers without recreating repositories",
    async (_label, apply, existing) => {
      const cwd = copyFixtureToTemp("active-assignment");
      configureAssignmentPresetGrading(cwd);
      const client = createReadyClient(existing ? [createRepository(JONES_REPOSITORY)] : []);
      if (existing) writeTrackedManifest(cwd, JONES_REPOSITORY);
      const fakeToken = "ghp_workflow_regression_fake_token";
      vi.spyOn(client, "writeRepositoryFile").mockRejectedValueOnce(
        new GitHubClientError("permission_denied", `Rejected credential ${fakeToken}`, {
          statusCode: 403
        })
      );
      const request = {
        cwd,
        assignmentFile: ASSIGNMENT_FILE,
        options: jsonYesOptions,
        githubClient: client,
        clock: fixedClock,
        retryOptions: { sleep: async () => {} }
      };

      const first = await apply(request);
      expect(first.status).toBe("partial_success");
      expect(first.exitCode).toBe(ExitCode.AuthenticationOrAuthorizationFailure);
      expect(first.summary.created).toBe(existing ? 1 : 2);
      expect(getRepositoryOutcomes(first)).toContainEqual(
        expect.objectContaining({
          repository: JONES_REPOSITORY,
          status: "failed",
          reason: "repository_apply_failed"
        })
      );
      const diagnostic = first.errors.find(
        (error) => error.code === "workflow_deployment_forbidden"
      );
      expect(diagnostic).toMatchObject({
        context: {
          operationType: "ensure_managed_grading_workflow",
          repositoryName: JONES_REPOSITORY,
          workflowPath: GRAIDER_MANAGED_WORKFLOW_PATH
        }
      });
      expect(diagnostic?.context?.remediation).toMatch(/authoriz.*workflow/iu);
      expect(formatCommandResultAsJson(first)).not.toMatch(/authorization:|Bearer |ghp_/u);
      const manifest = loadWrittenManifest(cwd).manifest;
      expect(manifest?.schemaVersion).toBe(1);
      const record = manifest?.repositories.find(
        (entry) => entry.repository.name === JONES_REPOSITORY
      );
      expect(record).toMatchObject({
        repository: { name: JONES_REPOSITORY },
        permissions: { student: { permission: "admin" }, facultyTeam: { permission: "admin" } },
        actions: { enabled: true },
        lifecycle: { status: "created" },
        errors: [diagnostic]
      });
      expect(record?.actions.gradingWorkflowFound).toBeUndefined();
      expect(manifest?.errors).toContainEqual(diagnostic);
      expect(
        fs.readFileSync(createManifestPath(cwd, "27s1", "lab04").absolutePath, "utf8")
      ).not.toContain(fakeToken);
      expect(client.workflowReads.filter((read) => read.repo === JONES_REPOSITORY)).toEqual([]);
      await expect(
        client.getRepositoryFileContent(
          ORGANIZATION,
          JONES_REPOSITORY,
          GRAIDER_MANAGED_WORKFLOW_PATH,
          TEMPLATE_BRANCH
        )
      ).resolves.toBeNull();
      expect(client.mutations.addedCollaborators).toHaveLength(2);
      expect(client.mutations.teamPermissions).toHaveLength(2);
      expect(client.mutations.enabledActions).toHaveLength(2);
      expect((await runAssignmentDetailCommand({ ...request, env: {} })).applyState?.status).toBe(
        "partially_applied"
      );
      const dashboard = await buildDashboard({ cwd, githubClient: client });
      expect(
        dashboard.cards[0]?.assignments.find((assignment) => assignment.slug === "lab04")
          ?.applyState
      ).toBe("partially_applied");
      expect(
        dashboard.cards[0]?.assignments.find((assignment) => assignment.slug === "lab04")
          ?.needsAttention
      ).toBe(true);
      expect(dashboard.cards[0]?.needsAttention).toBe(true);
      const createdCount = client.mutations.createdRepositories.length;
      const writesBeforeRecovery = [...client.mutations.fileWrites];
      if (manifest === undefined) throw new Error("Expected saved manifest.");
      const unrelatedWarning = {
        code: "historical_report_warning",
        severity: "warning" as const,
        message: "Prior report observation.",
        context: { operationType: "report", repositoryName: JONES_REPOSITORY }
      };
      writeManifest(createManifestPath(cwd, "27s1", "lab04").absolutePath, {
        ...manifest,
        warnings: [...manifest.warnings, unrelatedWarning],
        repositories: manifest.repositories.map((entry) =>
          entry.repository.name === JONES_REPOSITORY
            ? { ...entry, warnings: [...entry.warnings, unrelatedWarning] }
            : entry
        )
      });
      client.failNext("writeRepositoryFile", "permission_denied", { statusCode: 403 });
      expect((await apply(request)).status).toBe("partial_success");
      expect(loadWrittenManifest(cwd).manifest?.errors).toEqual([diagnostic]);
      expect(client.mutations.createdRepositories).toHaveLength(createdCount);

      const second = await apply(request);
      expect(second.status).toBe("success");
      expect(second.exitCode).toBe(ExitCode.Success);
      expect(second.summary.created).toBe(0);
      expect(client.mutations.createdRepositories).toHaveLength(createdCount);
      expect(client.mutations.fileWrites).toEqual([
        ...writesBeforeRecovery,
        expect.objectContaining({ repo: JONES_REPOSITORY, path: GRAIDER_MANAGED_WORKFLOW_PATH })
      ]);
      const recovered = loadWrittenManifest(cwd).manifest;
      expect(recovered?.errors).toEqual([]);
      expect(recovered?.warnings).toEqual([unrelatedWarning]);
      expect(
        recovered?.repositories.find((entry) => entry.repository.name === JONES_REPOSITORY)
          ?.warnings
      ).toEqual([unrelatedWarning]);
      expect(recovered?.operationHistory).toEqual([]);
      expect((await runAssignmentDetailCommand({ ...request, env: {} })).applyState?.status).toBe(
        "applied"
      );
      expect(
        (await buildDashboard({ cwd, githubClient: client })).cards[0]?.assignments.find(
          (assignment) => assignment.slug === "lab04"
        )?.applyState
      ).toBe("applied");
      expect(
        recovered?.repositories.find((entry) => entry.repository.name === JONES_REPOSITORY)
      ).toMatchObject({
        errors: [],
        actions: { enabled: true, gradingWorkflowFound: true, workflowDispatchSupported: true }
      });
      expect((await apply(request)).status).toBe("success");
      expect(client.mutations.createdRepositories).toHaveLength(createdCount);
      expect(client.mutations.fileWrites).toHaveLength(writesBeforeRecovery.length + 1);
    }
  );

  it("reports an unverified managed workflow as failed and verifies it on reapply without rewriting it", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    configureAssignmentPresetGrading(cwd);
    const client = createReadyClient();
    const verification = vi.spyOn(client, "getWorkflow").mockResolvedValue(null);
    const request = {
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonYesOptions,
      githubClient: client,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    };
    const first = await runAssignmentApplyCommand(request);
    expect(first.status).toBe("partial_success");
    expect(first.exitCode).not.toBe(ExitCode.Success);
    expect(getRepositoryOutcomes(first)).toEqual([
      expect.objectContaining({ repository: JONES_REPOSITORY, status: "failed" }),
      expect.objectContaining({ repository: PATEL_REPOSITORY, status: "failed" })
    ]);
    const saved = loadWrittenManifest(cwd).manifest;
    expect(saved?.errors).toEqual(first.errors);
    expect(saved?.repositories[0]).toMatchObject({
      actions: { enabled: true, gradingWorkflowFound: false, workflowDispatchSupported: false }
    });
    expect(saved?.repositories[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "grading_workflow_missing" }),
        expect.objectContaining({ code: "workflow_dispatch_unsupported" })
      ])
    );
    const createdCount = client.mutations.createdRepositories.length;
    const workflowWrites = [...client.mutations.fileWrites];
    verification.mockRestore();
    const second = await runAssignmentApplyCommand(request);
    expect(second.status).toBe("success");
    expect(client.mutations.createdRepositories).toHaveLength(createdCount);
    expect(client.mutations.fileWrites).toEqual(workflowWrites);
    expect(loadWrittenManifest(cwd).manifest?.errors).toEqual([]);
    expect(loadWrittenManifest(cwd).manifest?.repositories[0]).toMatchObject({
      actions: { gradingWorkflowFound: true, workflowDispatchSupported: true },
      errors: []
    });
  });

  it("reports workflow-file permission denial without relabeling other GitHub failures", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    removeAssignmentTemplate(cwd);
    configureAssignmentPresetGrading(cwd);
    const forbiddenClient = createReadyClient();
    forbiddenClient.failNext("writeRepositoryFile", "permission_denied");

    const forbiddenResult = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient: forbiddenClient,
      clock: fixedClock
    });

    expect(forbiddenResult.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "workflow_deployment_forbidden" })])
    );
    expect(forbiddenResult.status).toBe("partial_success");
    const forbiddenOutcomes = getRepositoryOutcomes(forbiddenResult);
    const jonesOutcome = forbiddenOutcomes.find(
      (outcome) => outcome.repository === JONES_REPOSITORY
    );
    expect(jonesOutcome).toMatchObject({
      status: "failed",
      reason: "repository_apply_failed"
    });
    expect(
      hasOutcomeDiagnostic(jonesOutcome, "workflow_deployment_forbidden", {
        operationType: "ensure_managed_grading_workflow",
        repositoryName: JONES_REPOSITORY
      })
    ).toBe(true);
    expect(forbiddenOutcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ repository: PATEL_REPOSITORY, status: "created" })
      ])
    );
    const forbiddenManifest = loadWrittenManifest(cwd);
    expect(forbiddenManifest.status).toBe("loaded");
    if (forbiddenManifest.status === "loaded") {
      expect(
        forbiddenManifest.manifest.repositories.map((record) => record.repository.name)
      ).toEqual([JONES_REPOSITORY, PATEL_REPOSITORY]);
    }
    expect(forbiddenClient.mutations.fileWrites).toEqual([
      expect.objectContaining({ repo: PATEL_REPOSITORY, path: GRAIDER_MANAGED_WORKFLOW_PATH })
    ]);

    const otherCwd = copyFixtureToTemp("active-assignment");
    removeAssignmentTemplate(otherCwd);
    configureAssignmentPresetGrading(otherCwd);
    const apiFailureClient = createReadyClient();
    apiFailureClient.failTimes("writeRepositoryFile", "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS);
    const apiResult = await runApplyCommand({
      cwd: otherCwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient: apiFailureClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(apiResult.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "github_api_error" })])
    );
    expect(apiResult.errors).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "workflow_deployment_forbidden" })])
    );
  });

  it("renders from the effective assignment grading override and verifies its workflow", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    removeAssignmentTemplate(cwd);
    configureAssignmentPresetGrading(cwd);
    const coursePath = path.join(cwd, "course.yml");
    fs.writeFileSync(
      coursePath,
      fs
        .readFileSync(coursePath, "utf8")
        .replace("workflow: grade.yml", "workflow: course-only.yml"),
      "utf8"
    );
    const githubClient = createReadyClient();
    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });
    const expected = renderJavaJunitCheckstyleWorkflow({
      grading: {
        enabled: true,
        mode: "preset",
        preset: "java-junit-checkstyle",
        workflow: GRAIDER_MANAGED_WORKFLOW_PATH,
        artifact: "grading-results",
        result_file: "results.json"
      }
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.fileWrites[0]?.content).toBe(expected);
    expect(githubClient.workflowReads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ repo: JONES_REPOSITORY, workflowPath: "grade.yml" })
      ])
    );
    expect(githubClient.workflowReads.map((read) => read.workflowPath)).not.toContain(
      "course-only.yml"
    );
  });

  it("creates and configures empty student repositories when no template is configured", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    removeAssignmentTemplate(cwd);
    const githubClient = createReadyClient();
    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });
    const manifestResult = loadWrittenManifest(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
    expect(githubClient.mutations.addedCollaborators).toHaveLength(1);
    expect(githubClient.mutations.teamPermissions).toHaveLength(1);
    expect(githubClient.mutations.enabledActions).toHaveLength(1);
    expect(githubClient.mutations.fileWrites).toEqual([]);
    expect(manifestResult.status).toBe("loaded");
    if (manifestResult.status === "loaded") {
      expect(manifestResult.manifest.template).toBeUndefined();
      expect(manifestResult.manifest.repositories[0]?.repository).toMatchObject({
        createdFromTemplate: false
      });
      expect(
        manifestResult.manifest.repositories[0]?.repository.templateRepository
      ).toBeUndefined();
    }
  });

  it("reports direct repository creation failures without falling back to a template", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    removeAssignmentTemplate(cwd);
    const githubClient = createReadyClient();
    githubClient.failTimes("createRepository", "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS);

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "github_api_error" })])
    );
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.createdRepositoriesWithoutTemplate).toEqual([]);
  });

  it("reuses a manifest-backed template-free repository without recreating it", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    removeAssignmentTemplate(cwd);
    const githubClient = createReadyClient();
    const request = {
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    };

    expect((await runApplyCommand(request)).exitCode).toBe(ExitCode.Success);
    expect((await runApplyCommand(request)).exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
  });

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
    if (manifestResult.status !== "loaded") throw new Error("Expected written manifest.");
    const jonesRepository = manifestResult.manifest.repositories.find(
      (repository) => repository.studentId === "jones"
    );
    if (jonesRepository === undefined) throw new Error("Expected Jones manifest record.");
    expect(jonesRepository.repository.templateCommitSha).toBe("template-sha");
    expect(jonesRepository.repository.studentDefaultBranchCommitSha).toEqual(expect.any(String));
    expect(jonesRepository.repository.templateSyncBaselineStatus).toBe("initialized");
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
    const { cwd, result } = await runApply("grading-disabled", githubClient);

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "repo_name_collision" })])
    );
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
    expect(githubClient.mutations.enabledActions).toEqual([]);
    expect(loadWrittenManifest(cwd).status).toBe("missing");
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

  it("keeps template-backed repository creation successful when the baseline is pending", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const manifestPath = createManifestPath(cwd, "27s1", "lab04");
    const githubClient = new DelayedTemplateMaterializationGitHubClient(manifestPath.absolutePath, {
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({
        username
      })),
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }]
    });

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });
    const manifest = loadManifest(manifestPath.absolutePath);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.errors).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "github_api_error" })])
    );
    expect(githubClient.manifestWasDurableBeforeBaselineLookup).toBe(true);
    expect(githubClient.mutations.addedCollaborators).toHaveLength(1);
    expect(githubClient.mutations.teamPermissions).toHaveLength(1);
    expect(githubClient.mutations.enabledActions).toHaveLength(1);
    expect(manifest.status).toBe("loaded");
    if (manifest.status !== "loaded") throw new Error("Expected written manifest.");
    const [jonesRepository] = manifest.manifest.repositories;
    if (jonesRepository === undefined) throw new Error("Expected Jones manifest record.");
    expect(jonesRepository.studentId).toBe("jones");
    expect(jonesRepository.repository).toMatchObject({
      name: JONES_REPOSITORY,
      createdFromTemplate: true,
      templateSyncBaselineStatus: "baseline_required"
    });
    expect(jonesRepository.repository.studentDefaultBranchCommitSha).toBeUndefined();
    expect(result.summary.repositories).toEqual([
      expect.objectContaining({ repository: JONES_REPOSITORY, status: "created" })
    ]);
  });

  it("writes a new empty manifest before attempting the first repository creation", async () => {
    const githubClient = createReadyClient();
    githubClient.failTimes(
      "createRepositoryFromTemplate",
      "api_error",
      DEFAULT_GITHUB_RETRY_ATTEMPTS
    );

    const { cwd, result } = await runApply("grading-disabled", githubClient);
    const manifest = loadWrittenManifest(cwd);

    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "github_api_error" })])
    );
    expect(manifest.status).toBe("loaded");
    if (manifest.status === "loaded") {
      expect(manifest.manifest.repositories).toEqual([]);
      expect(manifest.manifest.template?.repository).toBe(`${ORGANIZATION}/${TEMPLATE_REPO}`);
    }
  });

  it("stops later target operations when the post-creation manifest checkpoint fails", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const manifestPath = createManifestPath(cwd, "27s1", "lab04");
    const githubClient = new ManifestCheckpointFailureGitHubClient(manifestPath.absolutePath, {
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({
        username
      })),
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }]
    });

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "manifest_write_failed" })])
    );
    expect(result.summary.repositories).toEqual([
      expect.objectContaining({
        repository: JONES_REPOSITORY,
        status: "failed",
        reason: "repository_apply_failed"
      })
    ]);
    expect(githubClient.mutations.createdRepositories).toHaveLength(1);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
    expect(githubClient.mutations.enabledActions).toEqual([]);
  });

  it("probes a pending template baseline once without sleeping", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const githubClient = new EventuallyMaterializedTemplateGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({
        username
      })),
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }]
    });

    const sleep = vi.fn(async () => {});
    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep }
    });
    const manifest = loadWrittenManifest(cwd);

    expect(result.status).toBe("success");
    expect(githubClient.materializationReads).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(manifest.status).toBe("loaded");
    if (manifest.status === "loaded") {
      expect(manifest.manifest.repositories[0]?.repository).toMatchObject({
        templateCommitSha: "template-sha",
        templateSyncBaselineStatus: "baseline_required"
      });
      expect(
        manifest.manifest.repositories[0]?.repository.studentDefaultBranchCommitSha
      ).toBeUndefined();
    }
  });

  it.each([
    ["student permission", "addCollaborator"],
    ["Actions enablement", "enableActions"]
  ] as const)(
    "keeps the created repository manifest-tracked after later %s failure",
    async (_label, method) => {
      const githubClient = createReadyClient();
      githubClient.failTimes(method, "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS);

      const { cwd } = await runApply("grading-disabled", githubClient);
      const manifest = loadWrittenManifest(cwd);

      expect(manifest.status).toBe("loaded");
      if (manifest.status === "loaded") {
        expect(manifest.manifest.repositories[0]?.repository.name).toBe(JONES_REPOSITORY);
      }
    }
  );

  it("reports Failed and retains creation when post-create access setup fails", async () => {
    const githubClient = createReadyClient();
    githubClient.failTimes("addCollaborator", "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS, {
      statusCode: 500
    });

    const { cwd, result } = await runApply("grading-disabled", githubClient);
    const manifest = loadWrittenManifest(cwd);

    expect(result.status).toBe("partial_success");
    const collaboratorOutcome = getRepositoryOutcomes(result)[0];
    expect(collaboratorOutcome).toMatchObject({
      repository: JONES_REPOSITORY,
      status: "failed",
      reason: "repository_apply_failed"
    });
    expect(
      hasOutcomeDiagnostic(collaboratorOutcome, "github_api_error", {
        operationType: "add_student_collaborator",
        repositoryName: JONES_REPOSITORY,
        student_id: "jones",
        github_username: "seanjones",
        section: "001",
        statusCode: 500
      })
    ).toBe(true);
    expect(manifest.status).toBe("loaded");
    expect(manifest.manifest?.repositories[0]?.repository.name).toBe(JONES_REPOSITORY);

    const createdCount = githubClient.mutations.createdRepositories.length;
    githubClient.clearFailures();
    const rerun = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(rerun.status).toBe("success");
    expect(githubClient.mutations.createdRepositories).toHaveLength(createdCount);
  });

  it.each(["admin", "pull"] as const)(
    "verifies actual faculty %s grants and performs no repeat permission writes",
    async (initialPermission) => {
      let permission = initialPermission;
      const requests: string[] = [];
      const grantWrites: string[] = [];
      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
        const request = new Request(input, init);
        requests.push(`${request.method} ${new URL(request.url).pathname}`);
        if (request.method === "PUT") {
          grantWrites.push(request.url);
          permission = "admin";
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify([{ slug: "faculty", permission }]), {
            headers: { "content-type": "application/json" }
          })
        );
      });
      try {
        const adapter = new OctokitGitHubClient({ token: "synthetic-test-token" });
        const githubClient = createReadyClient();
        githubClient.getTeamPermission = adapter.getTeamPermission.bind(adapter);
        githubClient.addTeamPermission = adapter.addTeamPermission.bind(adapter);
        const { cwd, result } = await runApply("grading-disabled", githubClient);
        expect(result.status).toBe("success");
        expect(
          loadWrittenManifest(cwd).manifest?.repositories[0]?.permissions.facultyTeam
        ).toMatchObject({ teamSlug: "faculty", permission: "admin" });
        const rerun = await runApplyCommand({
          cwd,
          assignmentFile: ASSIGNMENT_FILE,
          options: yesOptions,
          githubClient,
          clock: fixedClock
        });
        expect(rerun.status).toBe("success");
        expect(grantWrites).toHaveLength(initialPermission === "admin" ? 0 : 1);
        expect(githubClient.mutations.createdRepositories).toHaveLength(1);
        expect(requests.filter((request) => request.startsWith("GET "))).toContain(
          `GET /repos/${ORGANIZATION}/${JONES_REPOSITORY}/teams`
        );
      } finally {
        fetchMock.mockRestore();
      }
    }
  );

  it.each(["student", "faculty", "invitation"] as const)(
    "does not claim complete access after an unverified %s grant",
    async (grant) => {
      const githubClient = new UnverifiedGrantGitHubClient(grant, {
        templateRepositories: [templateRepository],
        users: [{ username: "seanjones" }],
        teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }]
      });
      const { cwd, result } = await runApply("grading-disabled", githubClient);
      expect(getRepositoryOutcomes(result)[0]?.status).toBe(
        grant === "invitation" ? "created" : "failed"
      );
      const record = loadWrittenManifest(cwd).manifest?.repositories[0];
      if (grant === "invitation") {
        expect(record?.permissions.student).toMatchObject({
          permission: "admin",
          pendingInvite: true
        });
        expect(result.warnings).toContainEqual(
          expect.objectContaining({ code: "student_invitation_pending" })
        );
      } else {
        expect(result.status).toBe("partial_success");
        expect(
          hasOutcomeDiagnostic(getRepositoryOutcomes(result)[0], "github_api_error", {
            operationType:
              grant === "student" ? "add_student_collaborator" : "add_faculty_team_permission"
          })
        ).toBe(true);
        expect(
          grant === "student" ? record?.permissions.student : record?.permissions.facultyTeam
        ).toBeUndefined();
      }
    }
  );

  it("retries fresh-repository Actions readiness within a bounded propagation window", async () => {
    const githubClient = new ActionsPropagationGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones"].map((username) => ({ username })),
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }]
    });
    githubClient.failTimes("getActionsState", "api_error", 3, { statusCode: 404 });

    const { result } = await runApply("grading-disabled", githubClient);

    expect(result.status).toBe("success");
    expect(githubClient.actionsStateReads).toBe(FRESH_REPOSITORY_ACTIONS_MAX_ATTEMPTS + 1);
    expect(githubClient.mutations.createdRepositories).toHaveLength(1);
    expect(result.summary.retryCount).toBe(3);
    expect(result.summary.repositories).toEqual([
      expect.objectContaining({
        status: "created",
        reason: "repository_created",
        diagnostics: []
      })
    ]);
  });

  it("reports Failed with retained creation after Actions 404 retries exhaust", async () => {
    const githubClient = new ActionsPropagationGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones"].map((username) => ({ username })),
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }]
    });
    githubClient.failTimes("getActionsState", "api_error", FRESH_REPOSITORY_ACTIONS_MAX_ATTEMPTS, {
      statusCode: 404
    });

    const { cwd, result } = await runApply("grading-disabled", githubClient);

    expect(result.status).toBe("partial_success");
    expect(githubClient.actionsStateReads).toBe(FRESH_REPOSITORY_ACTIONS_MAX_ATTEMPTS);
    const actionsOutcome = getRepositoryOutcomes(result)[0];
    expect(actionsOutcome).toMatchObject({
      status: "failed",
      reason: "repository_apply_failed"
    });
    expect(
      hasOutcomeDiagnostic(actionsOutcome, "github_api_error", {
        operationType: "enable_actions",
        repositoryName: JONES_REPOSITORY,
        statusCode: 404
      })
    ).toBe(true);
    expect(loadWrittenManifest(cwd).manifest?.repositories[0]?.repository.name).toBe(
      JONES_REPOSITORY
    );

    const createdCount = githubClient.mutations.createdRepositories.length;
    githubClient.clearFailures();
    const rerun = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(rerun.status).toBe("success");
    expect(githubClient.mutations.createdRepositories).toHaveLength(createdCount);
  });

  it("reports Failed when an existing repository changes before a later failure", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    writeTrackedManifest(cwd, JONES_REPOSITORY);
    const githubClient = createReadyClient([createRepository(JONES_REPOSITORY)]);
    githubClient.failTimes("getActionsState", "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS, {
      statusCode: 404
    });

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.status).toBe("partial_success");
    const updateOutcome = getRepositoryOutcomes(result)[0];
    expect(updateOutcome).toMatchObject({
      status: "failed",
      reason: "repository_apply_failed"
    });
    expect(
      hasOutcomeDiagnostic(updateOutcome, "github_api_error", {
        operationType: "enable_actions",
        statusCode: 404
      })
    ).toBe(true);
  });

  it("keeps Failed when an existing repository has no successful update before failure", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    writeTrackedManifest(cwd, JONES_REPOSITORY);
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository],
      repositories: [createRepository(JONES_REPOSITORY)],
      users: [{ username: "seanjones" }],
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }],
      collaboratorPermissions: [
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          username: "seanjones",
          permission: "admin"
        }
      ],
      teamPermissions: [
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          teamSlug: "faculty",
          permission: "admin"
        },
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          teamSlug: "graders",
          permission: "maintain"
        }
      ]
    });
    githubClient.failTimes("getActionsState", "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS, {
      statusCode: 404
    });

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.summary.repositories).toEqual([
      expect.objectContaining({ status: "failed", reason: "repository_apply_failed" })
    ]);
  });

  it("keeps the created repository manifest-tracked after workflow verification fails", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    const githubClient = new StudentWorkflowFailureGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({
        username
      })),
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }]
    });

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });
    const manifest = loadWrittenManifest(cwd);

    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "github_api_error" })])
    );
    const workflowOutcome = getRepositoryOutcomes(result).find(
      (outcome) => outcome.repository === JONES_REPOSITORY
    );
    expect(workflowOutcome).toMatchObject({
      status: "failed",
      reason: "repository_apply_failed"
    });
    expect(
      hasOutcomeDiagnostic(workflowOutcome, "github_api_error", {
        operationType: "verify_grading_workflow",
        repositoryName: JONES_REPOSITORY
      })
    ).toBe(true);
    expect(manifest.status).toBe("loaded");
    if (manifest.status === "loaded") {
      expect(manifest.manifest.repositories.map((record) => record.repository.name)).toEqual([
        JONES_REPOSITORY,
        PATEL_REPOSITORY
      ]);
    }
    const subsequentDetail = await buildAssignmentGradePreview({
      cwd,
      assignmentFile: ASSIGNMENT_FILE
    });
    if (subsequentDetail.plan === null) throw new Error("Expected a grade preview plan.");
    expect(subsequentDetail.plan.repositories).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "student_repository_missing" })])
    );
  });

  it("tracks every created repository when one student fails and later students continue", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    const githubClient = createReadyClient();
    githubClient.failTimes("addCollaborator", "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS);

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });
    const manifest = loadWrittenManifest(cwd);

    expect(result.status).toBe("partial_success");
    expect(githubClient.mutations.createdRepositories).toHaveLength(2);
    expect(manifest.status).toBe("loaded");
    if (manifest.status === "loaded") {
      expect(manifest.manifest.repositories.map((record) => record.repository.name)).toEqual([
        JONES_REPOSITORY,
        PATEL_REPOSITORY
      ]);
    }
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

    const { cwd, result } = await runApply("grading-disabled", githubClient);

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "github_api_error" })])
    );
    const creationOutcome = getRepositoryOutcomes(result)[0];
    expect(creationOutcome).toMatchObject({
      status: "failed",
      reason: "repository_apply_failed"
    });
    expect(
      hasOutcomeDiagnostic(creationOutcome, "github_api_error", {
        operationType: "create_repository_from_template",
        repositoryName: JONES_REPOSITORY
      })
    ).toBe(true);
    expect(loadWrittenManifest(cwd).manifest?.repositories).toEqual([]);
  });

  it("uses the repository returned by template creation without rediscovery", async () => {
    const githubClient = new CreateResponseOnlyGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }]
    });
    const { cwd, result } = await runApply("grading-disabled", githubClient);
    const manifestResult = loadWrittenManifest(cwd);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.getRepositoryCalls).toBe(0);
    if (manifestResult.status === "loaded") {
      expect(manifestResult.manifest.repositories.map((record) => record.repository)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: JONES_REPOSITORY,
            id: TestNumber.ExistingRepositoryId
          })
        ])
      );
    } else {
      throw new Error("Expected written manifest.");
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
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }],
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

  it("reports one repository heartbeat before each individual target begins", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    const githubClient = createReadyClient();
    const progress: Array<{
      current: number;
      total: number;
      studentId?: string;
      repository: string;
    }> = [];
    const mutationsAtProgress: number[] = [];

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} },
      onRepositoryProgress: (event) => {
        progress.push(event);
        mutationsAtProgress.push(githubClient.mutations.createdRepositories.length);
      }
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(progress).toEqual([
      expect.objectContaining({
        current: 1,
        total: 2,
        studentId: "jones",
        repository: `${ORGANIZATION}/${JONES_REPOSITORY}`
      }),
      expect.objectContaining({
        current: 2,
        total: 2,
        studentId: "patel",
        repository: `${ORGANIZATION}/${PATEL_REPOSITORY}`
      })
    ]);
    expect(mutationsAtProgress).toEqual([0, 1]);
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
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }]
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

  it("reports incomplete grading setup when a new workflow remains unobservable", async () => {
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository],
      users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
      teams: [{ org: ORGANIZATION, slug: "faculty", name: "Faculty" }],
      workflows: [
        {
          owner: ORGANIZATION,
          repo: JONES_REPOSITORY,
          workflow: gradingWorkflow
        }
      ]
    });
    const { result } = await runApply("active-assignment", githubClient);

    expect(result.status).toBe("partial_success");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "grading_workflow_missing" })
    );
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
