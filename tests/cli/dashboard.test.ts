import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatDashboardResultAsJson,
  runDashboardCommand
} from "../../src/cli/commands/dashboard.command.js";
import type { DashboardResult } from "../../src/dashboard/dashboard-models.js";
import {
  FakeGitHubClient,
  type FakeRepositoryFileRecord
} from "../../src/github/fake-github-client.js";
import type { GitHubClient } from "../../src/github/github-client.js";
import type { GitHubTemplateRepository } from "../../src/github/github-models.js";

const TEMP_FIXTURE_PREFIX = "graider-dashboard-";
const FAKE_TOKEN = "ghp_fake_dashboard_token";
const COURSE_FILE = "course.yml";
const DEFAULT_TERM = "27s1";
const SECOND_TERM = "27s2";
const DEFAULT_SECTION = "001";
const SORTING_FIXTURE_ASSIGNMENT_COUNT = 7;
const ORGANIZATION = "example-org";
const TEMPLATE_BRANCH = "main";
const WORKFLOW_PATH = ".github/workflows/grade.yml";
const WORKFLOW_OBJECT_DISPATCH = `name: Grade
on:
  workflow_dispatch:
`;
const WORKFLOW_LIST_DISPATCH = `name: Grade
on:
  - push
  - workflow_dispatch
`;
const WORKFLOW_WITHOUT_DISPATCH = `name: Grade
on:
  push:
`;
const EMPTY_LENGTH = 0;
const SINGLE_CALL = 1;

const dashboardEnv = {
  GRAIDER_GITHUB_TOKEN: FAKE_TOKEN
};

const createTempRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), TEMP_FIXTURE_PREFIX));

const writeText = (cwd: string, relativePath: string, content: string): void => {
  const absolutePath = path.join(cwd, relativePath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
};

const writeCourse = (cwd: string): void => {
  writeText(
    cwd,
    COURSE_FILE,
    `schema_version: 1
course:
  code: csc1120
  title: CSC1120
  repository: csc1120
github:
  organization: example-org
  repository_visibility: private
  repo_name_pattern: "{term}-{course}-{assignment}-{github_username}"
  student_permission: push
  faculty_team: faculty
  faculty_permission: admin
  grader_team: graders
  grader_permission: maintain
defaults:
  timezone: America/Chicago
  assignment_type: individual
grading:
  enabled: true
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: graider-generated
    destination_file: grading/report.md
`
  );
};

const writeTerm = (
  cwd: string,
  termSlug = DEFAULT_TERM,
  displayName = "Spring 2027",
  sections: readonly string[] = [DEFAULT_SECTION]
): void => {
  writeText(
    cwd,
    `terms/${termSlug}/term.yml`,
    `schema_version: 1
term:
  code: ${termSlug}
  academic_year: 2027
  semester: 1
  display_name: ${displayName}
sections:
${sections.map((section) => `  - id: "${section}"\n    roster: rosters/section-${section}.csv`).join("\n")}
`
  );
};

const writeRoster = (
  cwd: string,
  termSlug = DEFAULT_TERM,
  section = DEFAULT_SECTION,
  rows: readonly string[] = ["jones,seanjones,001,active"]
): void => {
  writeText(
    cwd,
    `terms/${termSlug}/rosters/section-${section}.csv`,
    `student_id,github_username,section,status
${rows.join("\n")}
`
  );
};

const writeAssignment = (
  cwd: string,
  options: {
    readonly termSlug?: string;
    readonly slug: string;
    readonly title?: string;
    readonly status?: string;
    readonly dueAt?: string;
    readonly gradingEnabled?: boolean;
    readonly templateRepository?: string;
    readonly templateBranch?: string;
    readonly workflowPath?: string;
  }
): void => {
  const termSlug = options.termSlug ?? DEFAULT_TERM;
  const workflowPath = options.workflowPath ?? WORKFLOW_PATH;
  const gradingBlock = (() => {
    if (options.gradingEnabled === false) {
      return `grading:
  enabled: false
`;
    }

    if (options.workflowPath !== undefined || options.gradingEnabled === true) {
      return `grading:
  enabled: true
  mode: custom-workflow
  workflow: ${workflowPath}
  artifact: grading-results
  result_file: grading-results.json
`;
    }

    return "";
  })();

  writeText(
    cwd,
    `terms/${termSlug}/assignments/${options.slug}/assignment.yml`,
    `schema_version: 1
assignment:
  slug: ${options.slug}
  title: ${options.title ?? options.slug}
  type: individual
  status: ${options.status ?? "active"}
template:
  repository: ${options.templateRepository ?? `${ORGANIZATION}/${options.slug}-template`}
  branch: ${options.templateBranch ?? TEMPLATE_BRANCH}
sections:
  - "001"
deadline:
  due_at: "${options.dueAt ?? "2027-06-15T23:59:00+09:00"}"
  late_policy: standard
metadata:
  faculty_owner: professor
  lms_assignment_id: null
  grading_category: labs
  points: 100
${gradingBlock}`
  );
};

const createCourseFixture = (): string => {
  const cwd = createTempRoot();

  writeCourse(cwd);
  writeTerm(cwd);
  writeRoster(cwd);
  writeAssignment(cwd, { slug: "lab01", title: "Lab 01" });

  return cwd;
};

const templateRepository = (
  repo: string,
  branches: readonly string[] = [TEMPLATE_BRANCH]
): GitHubTemplateRepository => ({
  owner: ORGANIZATION,
  name: repo,
  fullName: `${ORGANIZATION}/${repo}`,
  id: repo.length,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${repo}`,
  isTemplate: true,
  branches: [...branches],
  files: ["README.md"],
  latestCommitSha: `${repo}-sha`
});

const workflowFile = (
  repo: string,
  content = WORKFLOW_OBJECT_DISPATCH,
  branch = TEMPLATE_BRANCH,
  workflowPath = WORKFLOW_PATH
): FakeRepositoryFileRecord => ({
  owner: ORGANIZATION,
  repo,
  path: workflowPath,
  content,
  message: "Seed workflow",
  commitSha: `${repo}-${branch}-${workflowPath}-sha`,
  branch
});

const uniqueValues = (values: readonly string[]): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

class ReadyDashboardGitHubClient extends FakeGitHubClient {
  override async getTemplateRepository(
    owner: string,
    repo: string
  ): ReturnType<FakeGitHubClient["getTemplateRepository"]> {
    const existingRepository = await super.getTemplateRepository(owner, repo);

    return existingRepository ?? templateRepository(repo);
  }

  override async getRepositoryFileContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string
  ): ReturnType<FakeGitHubClient["getRepositoryFileContent"]> {
    const existingContent = await super.getRepositoryFileContent(owner, repo, filePath, ref);

    return existingContent ?? (filePath === WORKFLOW_PATH ? WORKFLOW_OBJECT_DISPATCH : null);
  }
}

const createReadyClient = (
  assignmentSlugs: readonly string[] = ["lab01"],
  options: {
    readonly workflowContent?: string;
    readonly workflowPath?: string;
    readonly branch?: string;
    readonly templateRepositories?: GitHubTemplateRepository[];
    readonly repositoryFiles?: FakeRepositoryFileRecord[];
  } = {}
): FakeGitHubClient => {
  const branch = options.branch ?? TEMPLATE_BRANCH;
  const workflowPath = options.workflowPath ?? WORKFLOW_PATH;
  const repos = uniqueValues(assignmentSlugs.map((slug) => `${slug}-template`));

  return new ReadyDashboardGitHubClient({
    templateRepositories:
      options.templateRepositories ?? repos.map((repo) => templateRepository(repo, [branch])),
    repositoryFiles:
      options.repositoryFiles ??
      repos.map((repo) => workflowFile(repo, options.workflowContent, branch, workflowPath))
  });
};

class CountingDashboardGitHubClient extends FakeGitHubClient {
  readonly templateRepositoryReads: string[] = [];

  override getTemplateRepository(
    owner: string,
    repo: string
  ): ReturnType<FakeGitHubClient["getTemplateRepository"]> {
    this.templateRepositoryReads.push(`${owner}/${repo}`);

    return super.getTemplateRepository(owner, repo);
  }
}

const runDashboard = async (
  cwd: string,
  options: Parameters<typeof runDashboardCommand>[0]["options"] = { json: true },
  env: Record<string, string | undefined> = dashboardEnv,
  githubClient: GitHubClient = createReadyClient()
): Promise<DashboardResult> =>
  runDashboardCommand({
    cwd,
    options,
    env,
    githubClient
  });

const listFiles = (cwd: string): string[] =>
  fs
    .readdirSync(cwd, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(cwd, path.join(entry.parentPath, entry.name)))
    .sort((left, right) => left.localeCompare(right));

describe("graider dashboard command", () => {
  it("requires JSON output and returns a JSON failure shape", async () => {
    const result = await runDashboard(createCourseFixture(), {}, {});
    const json = JSON.parse(formatDashboardResultAsJson(result)) as DashboardResult;

    expect(json.schemaVersion).toBe(1);
    expect(json.commandName).toBe("dashboard");
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(1);
    expect(json.diagnostics).toEqual([
      expect.objectContaining({ code: "dashboard_json_required" })
    ]);
    expect(json.summary.cardCount).toBe(0);
    expect(json.cards).toEqual([]);
  });

  it("requires GRAIDER_GITHUB_TOKEN before local card loading", async () => {
    const result = await runDashboard(createCourseFixture(), { json: true }, {});

    expect(result.status).toBe("failure");
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "github_token_missing" })]);
    expect(result.cards).toEqual([]);
  });

  it("treats blank and whitespace GRAIDER_GITHUB_TOKEN as missing", async () => {
    const blank = await runDashboard(
      createCourseFixture(),
      { json: true },
      { GRAIDER_GITHUB_TOKEN: "" }
    );
    const whitespace = await runDashboard(
      createCourseFixture(),
      { json: true },
      { GRAIDER_GITHUB_TOKEN: "   " }
    );

    expect(blank.diagnostics).toEqual([expect.objectContaining({ code: "github_token_missing" })]);
    expect(whitespace.diagnostics).toEqual([
      expect.objectContaining({ code: "github_token_missing" })
    ]);
  });

  it("returns the dashboard JSON contract for one course and one term", async () => {
    const result = await runDashboard(createCourseFixture());
    const [card] = result.cards;

    expect(result).toMatchObject({
      schemaVersion: 1,
      commandName: "dashboard",
      status: "success",
      exitCode: 0,
      diagnostics: [],
      summary: {
        cardCount: 1,
        courseCount: 1,
        termCount: 1,
        assignmentCount: 1,
        needsAttentionCount: 0
      }
    });
    expect(card).toMatchObject({
      kind: "course-term",
      displayName: "27s1-csc1120",
      courseSlug: "csc1120",
      courseTitle: "CSC1120",
      coursePath: ".",
      termSlug: "27s1",
      termTitle: "Spring 2027",
      status: "active",
      needsAttention: false,
      attentionCount: 0,
      assignmentCount: 1
    });
    expect(card?.recentAssignments[0]).toMatchObject({
      slug: "lab01",
      title: "Lab 01",
      status: "active",
      gradingEnabled: true,
      gradingMode: "custom-workflow",
      studentPublishEnabled: true,
      assignmentFile: "terms/27s1/assignments/lab01/assignment.yml",
      applyState: "not_applied",
      templateRepository: "example-org/lab01-template",
      templateBranch: "main",
      workflow: ".github/workflows/grade.yml",
      github: {
        templateRepository: "available",
        templateBranch: "available",
        gradingWorkflow: "available",
        workflowDispatch: "available"
      },
      needsAttention: false,
      diagnostics: []
    });
  });

  it("returns one card per term and supports term filtering", async () => {
    const cwd = createCourseFixture();
    writeTerm(cwd, SECOND_TERM, "Summer 2027");
    writeRoster(cwd, SECOND_TERM);
    writeAssignment(cwd, { termSlug: SECOND_TERM, slug: "lab02", title: "Lab 02" });

    const allTerms = await runDashboard(cwd);
    const filtered = await runDashboard(cwd, { json: true, term: SECOND_TERM });

    expect(allTerms.cards.map((card) => card.termSlug)).toEqual([DEFAULT_TERM, SECOND_TERM]);
    expect(filtered.status).toBe("success");
    expect(filtered.cards.map((card) => card.displayName)).toEqual(["27s2-csc1120"]);
  });

  it("reports a missing requested term", async () => {
    const result = await runDashboard(createCourseFixture(), { json: true, term: "99s1" });

    expect(result.status).toBe("failure");
    expect(result.cards).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "dashboard_term_not_found",
        context: { termSlug: "99s1" }
      })
    ]);
  });

  it("sorts and limits recent active and completed assignments", async () => {
    const cwd = createTempRoot();
    writeCourse(cwd);
    writeTerm(cwd);
    writeRoster(cwd);
    writeAssignment(cwd, {
      slug: "active-old",
      title: "Active Old",
      status: "active",
      dueAt: "2027-01-01T00:00:00Z"
    });
    writeAssignment(cwd, {
      slug: "active-new",
      title: "Active New",
      status: "active",
      dueAt: "2027-03-01T00:00:00Z"
    });
    writeAssignment(cwd, {
      slug: "active-middle",
      title: "Active Middle",
      status: "active",
      dueAt: "2027-02-01T00:00:00Z"
    });
    writeAssignment(cwd, {
      slug: "closed-new",
      title: "Closed New",
      status: "closed",
      dueAt: "2027-05-01T00:00:00Z"
    });
    writeAssignment(cwd, {
      slug: "closed-old",
      title: "Closed Old",
      status: "closed",
      dueAt: "2027-04-01T00:00:00Z"
    });
    writeAssignment(cwd, {
      slug: "closed-older",
      title: "Closed Older",
      status: "closed",
      dueAt: "2027-03-15T00:00:00Z"
    });
    writeAssignment(cwd, { slug: "draft-one", status: "draft" });

    const [card] = (await runDashboard(cwd)).cards;

    expect(card?.assignmentCount).toBe(SORTING_FIXTURE_ASSIGNMENT_COUNT);
    expect(card?.recentAssignments.map((assignment) => assignment.slug)).toEqual([
      "active-new",
      "active-middle",
      "active-old",
      "closed-new",
      "closed-old"
    ]);
    expect(card?.recentAssignments.map((assignment) => assignment.status)).toEqual([
      "active",
      "active",
      "active",
      "completed",
      "completed"
    ]);
    expect(card?.recentAssignments).toHaveLength(5);
  });

  it("includes roster section, active student, and total student counts", async () => {
    const cwd = createTempRoot();
    writeCourse(cwd);
    writeTerm(cwd, DEFAULT_TERM, "Spring 2027", ["001", "002"]);
    writeRoster(cwd, DEFAULT_TERM, "001", [
      "jones,seanjones,001,active",
      "smith,janesmith,001,dropped"
    ]);
    writeRoster(cwd, DEFAULT_TERM, "002", ["lee,alexlee,002,active", "patel,mayapatel,002,active"]);
    writeAssignment(cwd, { slug: "lab01" });

    const [card] = (await runDashboard(cwd)).cards;

    expect(card?.roster).toEqual({
      sectionCount: 2,
      activeStudentCount: 3,
      totalStudentCount: 4
    });
    expect(card?.needsAttention).toBe(false);
  });

  it("marks invalid roster data as needing attention", async () => {
    const cwd = createCourseFixture();
    writeRoster(cwd, DEFAULT_TERM, DEFAULT_SECTION, ["jones,seanjones,001,invalid"]);

    const [card] = (await runDashboard(cwd)).cards;

    expect(card?.needsAttention).toBe(true);
    expect(card?.attentionCount).toBeGreaterThan(0);
    expect(card?.diagnostics).toEqual([expect.objectContaining({ code: "invalid_roster_status" })]);
  });

  it("keeps no-grading and not_applied assignments out of needs attention", async () => {
    const cwd = createTempRoot();
    writeCourse(cwd);
    writeTerm(cwd);
    writeRoster(cwd);
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository("manual-template")]
    });
    writeAssignment(cwd, {
      slug: "manual",
      title: "Manual Review",
      gradingEnabled: false
    });

    const [assignment] =
      (await runDashboard(cwd, { json: true }, dashboardEnv, githubClient)).cards[0]
        ?.recentAssignments ?? [];

    expect(assignment).toMatchObject({
      slug: "manual",
      gradingEnabled: false,
      applyState: "not_applied",
      github: {
        templateRepository: "available",
        templateBranch: "available",
        gradingWorkflow: "not_required",
        workflowDispatch: "not_required"
      },
      needsAttention: false,
      diagnostics: []
    });
    expect(githubClient.fileReads).toHaveLength(EMPTY_LENGTH);
  });

  it("marks assignments and cards when the template repository is missing", async () => {
    const result = await runDashboard(
      createCourseFixture(),
      { json: true },
      dashboardEnv,
      new FakeGitHubClient()
    );
    const [card] = result.cards;
    const [assignment] = card?.recentAssignments ?? [];

    expect(result.status).toBe("partial_success");
    expect(card?.needsAttention).toBe(true);
    expect(assignment).toMatchObject({
      needsAttention: true,
      github: {
        templateRepository: "missing",
        templateBranch: "not_checked",
        gradingWorkflow: "not_checked",
        workflowDispatch: "not_checked"
      }
    });
    expect(assignment?.diagnostics).toEqual([
      expect.objectContaining({
        code: "dashboard_template_repository_missing"
      })
    ]);
    expect(assignment?.diagnostics[0]?.context).toMatchObject({
      templateRepository: "example-org/lab01-template"
    });
  });

  it("marks assignments and cards when the template branch is missing", async () => {
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository("lab01-template", ["develop"])]
    });
    const result = await runDashboard(
      createCourseFixture(),
      { json: true },
      dashboardEnv,
      githubClient
    );
    const [card] = result.cards;
    const [assignment] = card?.recentAssignments ?? [];

    expect(result.status).toBe("partial_success");
    expect(card?.needsAttention).toBe(true);
    expect(assignment).toMatchObject({
      needsAttention: true,
      github: {
        templateRepository: "available",
        templateBranch: "missing",
        gradingWorkflow: "not_checked",
        workflowDispatch: "not_checked"
      }
    });
    expect(assignment?.diagnostics).toEqual([
      expect.objectContaining({
        code: "dashboard_template_branch_missing"
      })
    ]);
    expect(assignment?.diagnostics[0]?.context).toMatchObject({ templateBranch: "main" });
    expect(githubClient.fileReads).toHaveLength(EMPTY_LENGTH);
  });

  it("checks the configured full workflow path and reports missing workflows", async () => {
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository("lab01-template")]
    });
    const result = await runDashboard(
      createCourseFixture(),
      { json: true },
      dashboardEnv,
      githubClient
    );
    const [assignment] = result.cards[0]?.recentAssignments ?? [];

    expect(result.status).toBe("partial_success");
    expect(githubClient.fileReads).toEqual([
      {
        owner: ORGANIZATION,
        repo: "lab01-template",
        path: WORKFLOW_PATH,
        ref: TEMPLATE_BRANCH
      }
    ]);
    expect(assignment).toMatchObject({
      needsAttention: true,
      github: {
        templateRepository: "available",
        templateBranch: "available",
        gradingWorkflow: "missing",
        workflowDispatch: "not_checked"
      }
    });
    expect(assignment?.diagnostics).toEqual([
      expect.objectContaining({
        code: "dashboard_grading_workflow_missing"
      })
    ]);
    expect(assignment?.diagnostics[0]?.context).toMatchObject({
      checkedPath: WORKFLOW_PATH,
      workflow: WORKFLOW_PATH
    });
  });

  it("accepts workflow_dispatch in object and list workflow trigger forms", async () => {
    const objectResult = await runDashboard(
      createCourseFixture(),
      { json: true },
      dashboardEnv,
      createReadyClient(["lab01"], { workflowContent: WORKFLOW_OBJECT_DISPATCH })
    );
    const listResult = await runDashboard(
      createCourseFixture(),
      { json: true },
      dashboardEnv,
      createReadyClient(["lab01"], { workflowContent: WORKFLOW_LIST_DISPATCH })
    );

    expect(objectResult.status).toBe("success");
    expect(listResult.status).toBe("success");
    expect(listResult.cards[0]?.recentAssignments[0]?.github?.workflowDispatch).toBe("available");
  });

  it("reports grading workflows that lack workflow_dispatch", async () => {
    const result = await runDashboard(
      createCourseFixture(),
      { json: true },
      dashboardEnv,
      createReadyClient(["lab01"], { workflowContent: WORKFLOW_WITHOUT_DISPATCH })
    );
    const [assignment] = result.cards[0]?.recentAssignments ?? [];

    expect(result.status).toBe("partial_success");
    expect(assignment).toMatchObject({
      needsAttention: true,
      github: {
        gradingWorkflow: "available",
        workflowDispatch: "missing"
      }
    });
    expect(assignment?.diagnostics).toEqual([
      expect.objectContaining({ code: "dashboard_workflow_dispatch_missing" })
    ]);
  });

  it("contains GitHub request errors to affected assignments", async () => {
    const cwd = createCourseFixture();
    writeAssignment(cwd, { slug: "lab02", title: "Lab 02" });
    const githubClient = createReadyClient(["lab01", "lab02"]);

    githubClient.failNext("getTemplateRepository", "permission_denied");

    const result = await runDashboard(cwd, { json: true }, dashboardEnv, githubClient);
    const assignments = result.cards[0]?.recentAssignments ?? [];

    expect(result.status).toBe("partial_success");
    expect(assignments).toHaveLength(2);
    expect(assignments.some((assignment) => assignment.needsAttention)).toBe(true);
    expect(
      assignments.some((assignment) => assignment.github?.templateRepository === "available")
    ).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "dashboard_github_permission_denied" })
    ]);
  });

  it("maps rate limits and workflow request failures to dashboard diagnostics", async () => {
    const rateLimitedClient = createReadyClient(["lab01"]);
    const requestFailedClient = createReadyClient(["lab01"]);

    rateLimitedClient.failNext("getTemplateRepository", "rate_limited", {
      retryAfterSeconds: 60
    });
    requestFailedClient.failNext("getRepositoryFileContent", "network_error");

    const rateLimited = await runDashboard(
      createCourseFixture(),
      { json: true },
      dashboardEnv,
      rateLimitedClient
    );
    const requestFailed = await runDashboard(
      createCourseFixture(),
      { json: true },
      dashboardEnv,
      requestFailedClient
    );

    expect(rateLimited.diagnostics).toEqual([
      expect.objectContaining({
        code: "dashboard_github_rate_limited"
      })
    ]);
    expect(rateLimited.diagnostics[0]?.context).toMatchObject({ retryAfterSeconds: 60 });
    expect(requestFailed.diagnostics).toEqual([
      expect.objectContaining({ code: "dashboard_github_request_failed" })
    ]);
  });

  it("caches repeated template repository and workflow checks in one dashboard run", async () => {
    const cwd = createTempRoot();
    writeCourse(cwd);
    writeTerm(cwd);
    writeRoster(cwd);
    writeAssignment(cwd, { slug: "lab01", templateRepository: `${ORGANIZATION}/shared-template` });
    writeAssignment(cwd, { slug: "lab02", templateRepository: `${ORGANIZATION}/shared-template` });
    const githubClient = new CountingDashboardGitHubClient({
      templateRepositories: [templateRepository("shared-template")],
      repositoryFiles: [workflowFile("shared-template")]
    });

    const result = await runDashboard(cwd, { json: true }, dashboardEnv, githubClient);

    expect(result.status).toBe("success");
    expect(githubClient.templateRepositoryReads).toHaveLength(SINGLE_CALL);
    expect(githubClient.fileReads).toHaveLength(SINGLE_CALL);
  });

  it("includes branch and workflow path in the workflow cache key", async () => {
    const cwd = createTempRoot();
    const alternateWorkflowPath = ".github/workflows/alternate-grade.yml";
    writeCourse(cwd);
    writeTerm(cwd);
    writeRoster(cwd);
    writeAssignment(cwd, { slug: "lab01", templateRepository: `${ORGANIZATION}/shared-template` });
    writeAssignment(cwd, {
      slug: "lab02",
      templateRepository: `${ORGANIZATION}/shared-template`,
      workflowPath: alternateWorkflowPath
    });
    const githubClient = new CountingDashboardGitHubClient({
      templateRepositories: [templateRepository("shared-template")],
      repositoryFiles: [
        workflowFile("shared-template", WORKFLOW_OBJECT_DISPATCH, TEMPLATE_BRANCH, WORKFLOW_PATH),
        workflowFile(
          "shared-template",
          WORKFLOW_OBJECT_DISPATCH,
          TEMPLATE_BRANCH,
          alternateWorkflowPath
        )
      ]
    });

    const result = await runDashboard(cwd, { json: true }, dashboardEnv, githubClient);

    expect(result.status).toBe("success");
    expect(githubClient.templateRepositoryReads).toHaveLength(SINGLE_CALL);
    expect(githubClient.fileReads.map((read) => read.path).sort()).toEqual(
      [WORKFLOW_PATH, alternateWorkflowPath].sort()
    );
  });

  it("returns partial success when one assignment is broken but other data can load", async () => {
    const cwd = createCourseFixture();
    writeText(
      cwd,
      "terms/27s1/assignments/broken/assignment.yml",
      "schema_version: 1\nassignment: ["
    );

    const result = await runDashboard(cwd);
    const [card] = result.cards;

    expect(result.status).toBe("partial_success");
    expect(result.exitCode).toBe(2);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "invalid_yaml" })]);
    expect(card?.needsAttention).toBe(true);
    expect(card?.recentAssignments.map((assignment) => assignment.slug)).toContain("broken");
    expect(card?.recentAssignments.map((assignment) => assignment.slug)).toContain("lab01");
  });

  it("does not mutate files while building the dashboard", async () => {
    const cwd = createCourseFixture();
    const githubClient = createReadyClient(["lab01"]);
    const before = listFiles(cwd);
    const result = await runDashboard(cwd, { json: true }, dashboardEnv, githubClient);
    const after = listFiles(cwd);

    expect(result.status).toBe("success");
    expect(after).toEqual(before);
    expect(after.some((file) => file.includes("generated-workflows"))).toBe(false);
    expect(after.some((file) => file.includes("reports"))).toBe(false);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.removedCollaborators).toEqual([]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
    expect(githubClient.mutations.enabledActions).toEqual([]);
    expect(githubClient.mutations.workflowDispatches).toEqual([]);
    expect(githubClient.mutations.archivedRepositories).toEqual([]);
    expect(githubClient.mutations.fileWrites).toEqual([]);
  });
});
