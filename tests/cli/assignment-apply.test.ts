import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runApplyCommand } from "../../src/cli/commands/apply.command.js";
import {
  runAssignmentApplyCommand,
  runAssignmentRepositoryMappingsCommand
} from "../../src/cli/commands/assignment.command.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubTemplateRepository } from "../../src/github/github-models.js";
import { loadManifest } from "../../src/manifest/manifest-loader.js";
import { createManifestPath } from "../../src/manifest/manifest-paths.js";

enum TestNumber {
  TemplateRepositoryId = 101
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/apply");
const INVALID_CONFIG_ROOT = path.resolve("tests/fixtures/config/missing-assignment-field");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const MISSING_ASSIGNMENT_FILE = "terms/27s1/assignments/missing/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const APPLY_TIMESTAMP = "2026-09-01T14:30:00.000Z";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const JSON_YES_OPTIONS = normalizeCommonCommandOptions({ json: true, yes: true });
const YES_OPTIONS = normalizeCommonCommandOptions({ yes: true });
const FIXED_CLOCK = {
  now: () => new Date(APPLY_TIMESTAMP)
};

interface ApplyJsonOutput {
  readonly schemaVersion: 1;
  readonly commandName: string;
  readonly assignmentFile: string;
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: readonly unknown[];
  readonly generatedFiles: readonly string[];
  readonly summary: Record<string, unknown>;
}

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

const createReadyClient = (repositories: GitHubRepository[] = []): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository],
    repositories,
    users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
    teams: [
      { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
      { org: ORGANIZATION, slug: "graders", name: "Graders" }
    ]
  });

const configureGroupAssignment = (cwd: string, groups: string): void => {
  fs.appendFileSync(
    path.join(cwd, ASSIGNMENT_FILE),
    "\nrepository_mode: group\ngroups:\n  file: groups.csv\n"
  );
  fs.writeFileSync(
    path.join(cwd, "terms/27s1/assignments/lab04/groups.csv"),
    `group_id,student_id\n${groups}`
  );
};

const activateSmith = (cwd: string): void => {
  fs.writeFileSync(
    path.join(cwd, "terms/27s1/rosters/section-001.csv"),
    "student_id,github_username,section,status\njones,seanjones,001,active\nsmith,janesmith,001,active\n"
  );
};

const createExistingRepository = (name: string): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id: 202,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const copyFixtureToTemp = (fixtureName: string): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graider-assignment-apply-`));

  fs.cpSync(sourceRoot, destinationRoot, { recursive: true });
  return destinationRoot;
};

const copyInvalidConfigToTemp = (): string => {
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graider-assignment-apply-`));

  fs.cpSync(INVALID_CONFIG_ROOT, destinationRoot, { recursive: true });
  return destinationRoot;
};

const loadWrittenManifest = (cwd: string) => {
  const manifestPath = createManifestPath(cwd, "27s1", "lab04");

  return loadManifest(manifestPath.absolutePath);
};

const runCanonicalApply = (
  cwd: string,
  githubClient: FakeGitHubClient,
  assignmentFile: string = ASSIGNMENT_FILE
) =>
  runAssignmentApplyCommand({
    cwd,
    assignmentFile,
    options: JSON_YES_OPTIONS,
    githubClient,
    clock: FIXED_CLOCK,
    retryOptions: { sleep: async () => {} }
  });

const runLegacyApply = (
  cwd: string,
  githubClient: FakeGitHubClient,
  assignmentFile: string = ASSIGNMENT_FILE
) =>
  runApplyCommand({
    cwd,
    assignmentFile,
    options: JSON_YES_OPTIONS,
    githubClient,
    clock: FIXED_CLOCK,
    retryOptions: { sleep: async () => {} }
  });

const parseApplyJson = (jsonText: string): ApplyJsonOutput =>
  JSON.parse(jsonText) as ApplyJsonOutput;

const getDiagnosticCodes = (diagnostics: readonly { readonly code: string }[]): string[] =>
  diagnostics.map((diagnostic) => diagnostic.code);

describe("graider assignment apply command", () => {
  it("applies group targets and writes a v2 manifest after full success", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    activateSmith(cwd);
    configureGroupAssignment(cwd, "team-1,jones\nteam-1,smith\nteam-2,patel\n");
    const githubClient = createReadyClient();

    const result = await runCanonicalApply(cwd, githubClient);

    expect(result.status).toBe("success");
    expect(result.summary).toMatchObject({
      repositoryMode: "group",
      targetCount: 2,
      studentMappingCount: 3,
      manifestWritten: true
    });
    expect(githubClient.mutations.createdRepositories.map((entry) => entry.input.name)).toEqual([
      "27s1-se2030-lab04-team-1",
      "27s1-se2030-lab04-team-2"
    ]);
    expect(githubClient.mutations.addedCollaborators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repo: "27s1-se2030-lab04-team-1",
          username: "seanjones",
          permission: "admin"
        }),
        expect.objectContaining({
          repo: "27s1-se2030-lab04-team-1",
          username: "janesmith",
          permission: "admin"
        }),
        expect.objectContaining({
          repo: "27s1-se2030-lab04-team-2",
          username: "mayapatel",
          permission: "admin"
        })
      ])
    );
    expect(githubClient.mutations.teamPermissions).toHaveLength(4);
    expect(loadWrittenManifest(cwd)).toMatchObject({
      status: "loaded",
      manifest: { schemaVersion: 2, repositoryMode: "group" }
    });

    const mappings = await runAssignmentRepositoryMappingsCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: { json: true }
    });
    expect(mappings).toMatchObject({
      status: "success",
      repositoryMode: "group",
      summary: { targetCount: 2, studentMappingCount: 3 }
    });
    expect(
      mappings.studentMappings
        .filter((mapping) => mapping.studentId === "jones" || mapping.studentId === "smith")
        .map((mapping) => ({
          studentId: mapping.studentId,
          targetId: mapping.targetId,
          repositoryName: mapping.repositoryName,
          repositoryUrl: mapping.repositoryUrl
        }))
    ).toEqual([
      {
        studentId: "jones",
        targetId: "team-1",
        repositoryName: "27s1-se2030-lab04-team-1",
        repositoryUrl: "https://github.com/example-org/27s1-se2030-lab04-team-1"
      },
      {
        studentId: "smith",
        targetId: "team-1",
        repositoryName: "27s1-se2030-lab04-team-1",
        repositoryUrl: "https://github.com/example-org/27s1-se2030-lab04-team-1"
      }
    ]);
  });

  it("blocks an invalid group plan before repository or manifest mutation", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    configureGroupAssignment(cwd, "team-1,jones\nteam-1,patel\n");
    const githubClient = createReadyClient();

    const result = await runCanonicalApply(cwd, githubClient);

    expect(result.status).toBe("failure");
    expect(getDiagnosticCodes(result.errors)).toContain("group_cross_section");
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(loadWrittenManifest(cwd).status).toBe("missing");
  });

  it("blocks untracked existing group repositories before mutation", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    configureGroupAssignment(cwd, "team-1,jones\nteam-2,patel\n");
    const githubClient = createReadyClient([createExistingRepository("27s1-se2030-lab04-team-1")]);

    const result = await runCanonicalApply(cwd, githubClient);

    expect(result.status).toBe("failure");
    expect(getDiagnosticCodes(result.errors)).toContain("group_repository_untracked_collision");
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(loadWrittenManifest(cwd).status).toBe("missing");
  });

  it("does not write a manifest after an executor failure following earlier mutation", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    configureGroupAssignment(cwd, "team-1,jones\nteam-2,patel\n");
    const githubClient = createReadyClient();
    const createRepository = githubClient.createRepositoryFromTemplate.bind(githubClient);
    let createCount = 0;
    githubClient.createRepositoryFromTemplate = async (input) => {
      createCount += 1;
      if (createCount === 2) throw new Error("mock target failure");
      return createRepository(input);
    };

    const result = await runCanonicalApply(cwd, githubClient);

    expect(result.status).toBe("failure");
    expect(result.warnings.map((diagnostic) => diagnostic.code)).toContain(
      "group_apply_manifest_not_written"
    );
    expect(githubClient.mutations.createdRepositories).toHaveLength(1);
    expect(loadWrittenManifest(cwd).status).toBe("missing");
  });

  it("reports a writer failure without creating a misleading manifest", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    configureGroupAssignment(cwd, "team-1,jones\nteam-2,patel\n");
    const githubClient = createReadyClient();

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: JSON_YES_OPTIONS,
      githubClient,
      clock: FIXED_CLOCK,
      retryOptions: { sleep: async () => {} },
      groupManifestWriter: () => ({
        status: "failure",
        manifestPath: null,
        diagnostics: [
          {
            code: "manifest_write_failed",
            severity: "error",
            message: "Failed to write group manifest."
          }
        ]
      })
    });

    expect(result.status).toBe("failure");
    expect(getDiagnosticCodes(result.errors)).toContain("manifest_write_failed");
    expect(result.warnings.map((diagnostic) => diagnostic.code)).toContain(
      "group_apply_manifest_not_written"
    );
    expect(githubClient.mutations.createdRepositories).toHaveLength(2);
    expect(loadWrittenManifest(cwd).status).toBe("missing");
  });

  it("accepts assignment apply and returns the canonical JSON command name", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const result = await runCanonicalApply(cwd, createReadyClient());
    const json = parseApplyJson(formatCommandResultAsJson(result));

    expect(json.schemaVersion).toBe(1);
    expect(json.commandName).toBe("assignment apply");
    expect(json.assignmentFile).toBe(ASSIGNMENT_FILE);
    expect(json.status).toBe("success");
    expect(json.exitCode).toBe(ExitCode.Success);
    expect(json.generatedFiles).toContain(json.summary.manifestFile);
  });

  it("routes through the same implementation behavior as legacy apply", async () => {
    const legacyCwd = copyFixtureToTemp("grading-disabled");
    const canonicalCwd = copyFixtureToTemp("grading-disabled");
    const legacyClient = createReadyClient();
    const canonicalClient = createReadyClient();
    const legacyResult = await runLegacyApply(legacyCwd, legacyClient);
    const canonicalResult = await runCanonicalApply(canonicalCwd, canonicalClient);

    expect(legacyResult.status).toBe(canonicalResult.status);
    expect(legacyResult.exitCode).toBe(canonicalResult.exitCode);
    expect(legacyResult.generatedFiles).toEqual(canonicalResult.generatedFiles);
    expect(legacyResult.summary).toMatchObject({
      created: canonicalResult.summary.created,
      existing: canonicalResult.summary.existing,
      verified: canonicalResult.summary.verified,
      noop: canonicalResult.summary.noop,
      skipped: canonicalResult.summary.skipped,
      manifestFile: canonicalResult.summary.manifestFile
    });
    expect(
      legacyClient.mutations.createdRepositories.map((record) => record.repository.name)
    ).toEqual(
      canonicalClient.mutations.createdRepositories.map((record) => record.repository.name)
    );
    expect(loadWrittenManifest(legacyCwd).status).toBe("loaded");
    expect(loadWrittenManifest(canonicalCwd).status).toBe("loaded");
  });

  it("keeps the existing real apply command working as the legacy alias", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const result = await runLegacyApply(cwd, createReadyClient());
    const json = parseApplyJson(formatCommandResultAsJson(result));

    expect(json.commandName).toBe("apply");
    expect(json.status).toBe("success");
    expect(json.generatedFiles).toContain(json.summary.manifestFile);
  });

  it("matches legacy missing assignment file behavior", async () => {
    const legacyCwd = copyFixtureToTemp("grading-disabled");
    const canonicalCwd = copyFixtureToTemp("grading-disabled");
    const legacyResult = await runLegacyApply(
      legacyCwd,
      createReadyClient(),
      MISSING_ASSIGNMENT_FILE
    );
    const canonicalResult = await runCanonicalApply(
      canonicalCwd,
      createReadyClient(),
      MISSING_ASSIGNMENT_FILE
    );

    expect(canonicalResult.status).toBe(legacyResult.status);
    expect(canonicalResult.exitCode).toBe(legacyResult.exitCode);
    expect(getDiagnosticCodes(canonicalResult.errors)).toEqual(
      getDiagnosticCodes(legacyResult.errors)
    );
    expect(canonicalResult.generatedFiles).toEqual([]);
  });

  it("matches legacy invalid assignment behavior", async () => {
    const legacyCwd = copyInvalidConfigToTemp();
    const canonicalCwd = copyInvalidConfigToTemp();
    const legacyResult = await runLegacyApply(legacyCwd, createReadyClient());
    const canonicalResult = await runCanonicalApply(canonicalCwd, createReadyClient());

    expect(canonicalResult.status).toBe(legacyResult.status);
    expect(canonicalResult.exitCode).toBe(legacyResult.exitCode);
    expect(getDiagnosticCodes(canonicalResult.errors)).toEqual(
      getDiagnosticCodes(legacyResult.errors)
    );
    expect(canonicalResult.generatedFiles).toEqual([]);
  });

  it("matches legacy missing token behavior", async () => {
    vi.stubEnv("GRAIDER_GITHUB_TOKEN", "");
    vi.stubEnv("GITHUB_TOKEN", "");

    try {
      const legacyCwd = copyFixtureToTemp("grading-disabled");
      const canonicalCwd = copyFixtureToTemp("grading-disabled");
      const legacyResult = await runApplyCommand({
        cwd: legacyCwd,
        assignmentFile: ASSIGNMENT_FILE,
        options: YES_OPTIONS,
        clock: FIXED_CLOCK,
        retryOptions: { sleep: async () => {} }
      });
      const canonicalResult = await runAssignmentApplyCommand({
        cwd: canonicalCwd,
        assignmentFile: ASSIGNMENT_FILE,
        options: YES_OPTIONS,
        clock: FIXED_CLOCK,
        retryOptions: { sleep: async () => {} }
      });

      expect(canonicalResult.status).toBe(legacyResult.status);
      expect(canonicalResult.exitCode).toBe(legacyResult.exitCode);
      expect(canonicalResult.errors).toEqual(legacyResult.errors);
      expect(loadWrittenManifest(canonicalCwd).status).toBe("missing");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("preserves confirmation guard behavior on the canonical route", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const githubClient = createReadyClient();
    const result = await runAssignmentApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: normalizeCommonCommandOptions({ json: true }),
      githubClient,
      clock: FIXED_CLOCK,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([expect.objectContaining({ code: "confirmation_required" })]);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
  });

  it("does not introduce extra mutation behavior beyond legacy apply", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const githubClient = createReadyClient();

    await runCanonicalApply(cwd, githubClient);

    expect(
      githubClient.mutations.createdRepositories.map((record) => record.repository.name)
    ).toEqual([JONES_REPOSITORY]);
    expect(githubClient.mutations.removedCollaborators).toEqual([]);
    expect(githubClient.mutations.archivedRepositories).toEqual([]);
    expect(githubClient.mutations.fileWrites).toEqual([]);
  });
});
