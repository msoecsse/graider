import { describe, expect, it } from "vitest";
import type {
  RawAssignmentConfig,
  RawCourseConfig,
  RawTermConfig
} from "../../src/config/config-models.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import { validateGitHubReadiness } from "../../src/github/github-readiness-validation.js";
import type { GitHubTemplateRepository } from "../../src/github/github-models.js";
import type { RosterStudent } from "../../src/roster/roster-models.js";

enum TestNumber {
  TemplateRepositoryId = 101,
  FacultyTeamId = 201,
  GraderTeamId = 202,
  StudentUserId = 301
}

const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_FULL_NAME = `${ORGANIZATION}/${TEMPLATE_REPO}`;
const TEMPLATE_BRANCH = "main";
const FACULTY_TEAM = "faculty";
const GRADER_TEAM = "graders";
const README_FILE = "README.md";
const STUDENT_ID = "jones";
const GITHUB_USERNAME = "seanjones";

const courseConfig: RawCourseConfig = {
  schema_version: 1,
  course: {
    code: "se2030",
    title: "Software Engineering",
    repository: "se2030-graider"
  },
  github: {
    organization: ORGANIZATION,
    repository_visibility: "private",
    repo_name_pattern: "{term}-{course}-{assignment}-{student}",
    student_permission: "push",
    faculty_team: FACULTY_TEAM,
    faculty_permission: "admin",
    grader_team: GRADER_TEAM,
    grader_permission: "maintain"
  },
  defaults: {
    timezone: "Asia/Tokyo",
    assignment_type: "individual"
  },
  grading: {
    enabled: true,
    workflow: "grade.yml",
    artifact: "grading-results",
    result_file: "results.json"
  },
  reports: {
    formats: ["markdown"]
  }
};

const termConfig: RawTermConfig = {
  schema_version: 1,
  term: {
    code: "27s1",
    academic_year: 2027,
    semester: 1,
    display_name: "Spring 2027"
  },
  sections: [
    {
      id: "001",
      roster: "rosters/section-001.csv"
    }
  ]
};

const assignmentConfig: RawAssignmentConfig = {
  schema_version: 1,
  assignment: {
    slug: "lab04",
    title: "Lab 04",
    type: "individual",
    status: "active"
  },
  template: {
    repository: TEMPLATE_FULL_NAME,
    branch: TEMPLATE_BRANCH
  },
  sections: ["001"],
  deadline: {
    due_at: "2027-04-15T23:59:00+09:00",
    late_policy: "standard"
  },
  metadata: {
    faculty_owner: "professor",
    lms_assignment_id: null,
    grading_category: "labs",
    points: 100
  }
};

const students: RosterStudent[] = [
  {
    studentId: STUDENT_ID,
    githubUsername: GITHUB_USERNAME,
    section: "001",
    status: "active",
    rosterPath: "terms/27s1/rosters/section-001.csv",
    rowNumber: 2
  }
];

const createTemplateRepository = (
  overrides: Partial<GitHubTemplateRepository> = {}
): GitHubTemplateRepository => ({
  owner: ORGANIZATION,
  name: TEMPLATE_REPO,
  fullName: TEMPLATE_FULL_NAME,
  id: TestNumber.TemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${TEMPLATE_FULL_NAME}`,
  isTemplate: true,
  branches: [TEMPLATE_BRANCH],
  files: [README_FILE],
  latestCommitSha: "template-sha",
  ...overrides
});

const createReadyClient = (
  templateRepository: GitHubTemplateRepository | null = createTemplateRepository()
): FakeGitHubClient =>
  new FakeGitHubClient({
    ...(templateRepository === null ? {} : { templateRepositories: [templateRepository] }),
    users: [{ username: GITHUB_USERNAME, id: TestNumber.StudentUserId }],
    teams: [
      {
        org: ORGANIZATION,
        slug: FACULTY_TEAM,
        name: "Faculty",
        id: TestNumber.FacultyTeamId
      },
      {
        org: ORGANIZATION,
        slug: GRADER_TEAM,
        name: "Graders",
        id: TestNumber.GraderTeamId
      }
    ]
  });

const validateWith = async (
  githubClient: FakeGitHubClient,
  assignment: RawAssignmentConfig = assignmentConfig
) =>
  validateGitHubReadiness({
    courseConfig,
    termConfig,
    assignmentConfig: assignment,
    students,
    githubClient
  });

const expectErrorCode = async (
  githubClient: FakeGitHubClient,
  code: string,
  assignment: RawAssignmentConfig = assignmentConfig
): Promise<void> => {
  const result = await validateWith(githubClient, assignment);

  expect(result.errors).toEqual([expect.objectContaining({ code })]);
};

describe("GitHub readiness validation", () => {
  it("authenticated user check passes", async () => {
    const result = await validateWith(createReadyClient());

    expect(result.errors).toEqual([]);
  });

  it("TC-GH-READY-001 template repo exists passes", async () => {
    const result = await validateWith(createReadyClient());

    expect(result).toEqual({
      warnings: [],
      errors: []
    });
  });

  it("TC-GH-READY-002 template repo missing fails", async () => {
    await expectErrorCode(createReadyClient(null), "template_repository_missing");
  });

  it("TC-GH-READY-003 template outside org fails", async () => {
    await expectErrorCode(
      createReadyClient(
        createTemplateRepository({ owner: "other-org", fullName: "other-org/lab04-template" })
      ),
      "template_repository_outside_org",
      {
        ...assignmentConfig,
        template: {
          repository: "other-org/lab04-template",
          branch: TEMPLATE_BRANCH
        }
      }
    );
  });

  it("TC-GH-READY-004 template not marked template fails", async () => {
    await expectErrorCode(
      createReadyClient(createTemplateRepository({ isTemplate: false })),
      "template_repository_not_template"
    );
  });

  it("TC-GH-READY-005 template branch missing fails", async () => {
    await expectErrorCode(
      createReadyClient(createTemplateRepository({ branches: ["starter"] })),
      "template_branch_missing"
    );
  });

  it("TC-GH-READY-006 template branch not default fails", async () => {
    await expectErrorCode(
      createReadyClient(
        createTemplateRepository({ defaultBranch: "starter", branches: ["main", "starter"] })
      ),
      "template_branch_not_default"
    );
  });

  it("TC-GH-READY-007 README missing fails with repository context", async () => {
    const result = await validateWith(createReadyClient(createTemplateRepository({ files: [] })));

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "template_readme_missing",
        context: expect.objectContaining({
          repository: TEMPLATE_FULL_NAME
        }) as Record<string, unknown>
      })
    ]);
  });

  it("TC-GH-READY-008 faculty team missing fails", async () => {
    await expectErrorCode(
      new FakeGitHubClient({
        templateRepositories: [createTemplateRepository()],
        users: [{ username: GITHUB_USERNAME }],
        teams: [{ org: ORGANIZATION, slug: GRADER_TEAM, name: "Graders" }]
      }),
      "faculty_team_missing"
    );
  });

  it("TC-GH-READY-009 grader team missing fails", async () => {
    await expectErrorCode(
      new FakeGitHubClient({
        templateRepositories: [createTemplateRepository()],
        users: [{ username: GITHUB_USERNAME }],
        teams: [{ org: ORGANIZATION, slug: FACULTY_TEAM, name: "Faculty" }]
      }),
      "grader_team_missing"
    );
  });

  it("TC-ROSTER-011 GitHub username not found fails with student context", async () => {
    const result = await validateWith(
      new FakeGitHubClient({
        templateRepositories: [createTemplateRepository()],
        teams: [
          { org: ORGANIZATION, slug: FACULTY_TEAM, name: "Faculty" },
          { org: ORGANIZATION, slug: GRADER_TEAM, name: "Graders" }
        ]
      })
    );

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "github_user_missing",
        context: expect.objectContaining({
          student_id: STUDENT_ID,
          github_username: GITHUB_USERNAME,
          section: "001",
          status: "active"
        }) as Record<string, unknown>
      })
    ]);
  });

  it("TC-CLI-VALIDATE-004 invalid template fails", async () => {
    await expectErrorCode(createReadyClient(), "invalid_template_repository", {
      ...assignmentConfig,
      template: {
        repository: "too/many/segments",
        branch: TEMPLATE_BRANCH
      }
    });
  });

  it("auth missing maps to GitHub auth diagnostic", async () => {
    const client = createReadyClient();
    client.failNext("getAuthenticatedUser", "auth_missing");

    await expectErrorCode(client, "github_auth_missing");
  });

  it("permission denied maps to GitHub auth diagnostic", async () => {
    const client = createReadyClient();
    client.failNext("getAuthenticatedUser", "permission_denied");

    await expectErrorCode(client, "github_permission_denied");
  });

  it("rate limit maps to GitHub API diagnostic", async () => {
    const client = createReadyClient();
    client.failNext("getAuthenticatedUser", "rate_limited");

    await expectErrorCode(client, "github_rate_limited");
  });

  it("network and API failures map to GitHub API diagnostics", async () => {
    const networkClient = createReadyClient();
    const apiClient = createReadyClient();
    networkClient.failNext("getAuthenticatedUser", "network_error");
    apiClient.failNext("getAuthenticatedUser", "api_error");

    await expectErrorCode(networkClient, "github_network_error");
    await expectErrorCode(apiClient, "github_api_error");
  });
});
