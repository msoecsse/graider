import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type { GitHubTemplateRepository } from "../../../src/github/github-models.js";
import { buildPlan } from "../../../src/planning/plan-builder.js";
import { renderPlanJson } from "../../../src/planning/plan-renderer.js";
import { loadAssignmentRosters } from "../../../src/roster/roster-loader.js";

enum TestNumber {
  TemplateRepositoryId = 101,
  ExistingRepositoryId = 202
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/plan");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const CREATED_AT = "2026-09-01T14:30:00.000Z";
const EXPECTED_REPOSITORY_NAME = "27s1-se2030-lab04-seanjones";

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

const createReadyClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository],
    users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
    teams: [
      { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
      { org: ORGANIZATION, slug: "graders", name: "Graders" }
    ]
  });

const loadFixture = (name: string) => {
  const configResult = loadGraiderConfig({
    cwd: path.join(FIXTURE_ROOT, name),
    assignmentFile: ASSIGNMENT_FILE
  });

  if (configResult.status === "failure") {
    throw new Error("Fixture config must load.");
  }

  const rosterResult = loadAssignmentRosters(configResult.config);

  if (rosterResult.errors.length > 0) {
    throw new Error("Fixture roster must load.");
  }

  return {
    config: configResult.config,
    rosterResult
  };
};

describe("plan builder", () => {
  it("builds repository creation operations for active students", async () => {
    const { config, rosterResult } = loadFixture("active-assignment");
    const plan = await buildPlan({
      config,
      students: rosterResult.students,
      rosterSummary: rosterResult.summary,
      githubClient: createReadyClient(),
      createdAt: CREATED_AT
    });

    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "create_repository_from_template",
          status: "planned",
          student_id: "jones",
          repository_name: EXPECTED_REPOSITORY_NAME
        }),
        expect.objectContaining({
          type: "create_repository_from_template",
          status: "planned",
          student_id: "patel",
          repository_name: "27s1-se2030-lab04-mayapatel"
        })
      ])
    );
    expect(plan.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: "jones",
          mode: "individual",
          repositoryName: EXPECTED_REPOSITORY_NAME,
          studentIds: ["jones"],
          githubUsernames: ["seanjones"],
          plannedStudentPermission: "admin"
        })
      ])
    );
  });

  it("skips grading workflow operations when grading is disabled", async () => {
    const { config, rosterResult } = loadFixture("grading-disabled");
    const plan = await buildPlan({
      config,
      students: rosterResult.students,
      rosterSummary: rosterResult.summary,
      githubClient: createReadyClient(),
      createdAt: CREATED_AT
    });

    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "verify_grading_workflow",
          status: "skipped",
          reason: "grading_disabled"
        }),
        expect.objectContaining({
          type: "verify_workflow_dispatch",
          status: "skipped",
          reason: "grading_disabled"
        })
      ])
    );
  });

  it("includes source file hashes and input fingerprint with repository-relative paths", async () => {
    const { config, rosterResult } = loadFixture("active-assignment");
    const plan = await buildPlan({
      config,
      students: rosterResult.students,
      rosterSummary: rosterResult.summary,
      githubClient: createReadyClient(),
      createdAt: CREATED_AT
    });

    expect(plan.source.source_files.map((sourceFile) => sourceFile.path)).toEqual([
      "course.yml",
      "terms/27s1/assignments/lab04/assignment.yml",
      "terms/27s1/rosters/section-001.csv",
      "terms/27s1/rosters/section-002.csv",
      "terms/27s1/term.yml"
    ]);
    expect(plan.source.input_fingerprint).toMatch(/^[a-f0-9]+$/u);
    expect(plan.source.source_files.every((sourceFile) => !path.isAbsolute(sourceFile.path))).toBe(
      true
    );
  });

  it("marks repository collisions as blocked diagnostics", async () => {
    const { config, rosterResult } = loadFixture("grading-disabled");
    const plan = await buildPlan({
      config,
      students: rosterResult.students,
      rosterSummary: rosterResult.summary,
      githubClient: new FakeGitHubClient({
        templateRepositories: [templateRepository],
        users: [{ username: "seanjones" }],
        teams: [
          { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
          { org: ORGANIZATION, slug: "graders", name: "Graders" }
        ],
        repositories: [
          {
            owner: ORGANIZATION,
            name: EXPECTED_REPOSITORY_NAME,
            fullName: `${ORGANIZATION}/${EXPECTED_REPOSITORY_NAME}`,
            id: TestNumber.ExistingRepositoryId,
            private: true,
            archived: false,
            defaultBranch: TEMPLATE_BRANCH,
            htmlUrl: `https://github.com/${ORGANIZATION}/${EXPECTED_REPOSITORY_NAME}`
          }
        ]
      }),
      createdAt: CREATED_AT
    });

    expect(plan.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "plan_contains_blocked_operations" })
      ])
    );
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "blocked",
          errors: [expect.objectContaining({ code: "repo_name_collision" })]
        })
      ])
    );
  });

  it("renders parseable plan JSON", async () => {
    const { config, rosterResult } = loadFixture("grading-disabled");
    const plan = await buildPlan({
      config,
      students: rosterResult.students,
      rosterSummary: rosterResult.summary,
      githubClient: createReadyClient(),
      createdAt: CREATED_AT
    });

    expect(JSON.parse(renderPlanJson(plan))).toMatchObject({
      schema_version: 1,
      created_at: CREATED_AT
    });
  });
});
