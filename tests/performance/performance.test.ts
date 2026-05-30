import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runApplyCommand } from "../../src/cli/commands/apply.command.js";
import { runPlanCommand } from "../../src/cli/commands/plan.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubTemplateRepository } from "../../src/github/github-models.js";
import { loadManifest } from "../../src/manifest/manifest-loader.js";
import { createManifestPath } from "../../src/manifest/manifest-paths.js";
import { loadGraiderConfig } from "../../src/config/config-loader.js";
import { loadAssignmentRosters } from "../../src/roster/roster-loader.js";

enum PerformanceNumber {
  ActiveStudentCount = 150,
  RosterRowCount = 500,
  TemplateRepositoryId = 101,
  StudentIdPadLength = 4,
  SectionModulo = 2,
  FirstIndex = 1,
  ScaleTestTimeoutMs = 20000
}

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const FIXED_TIMESTAMP = "2026-09-01T14:30:00.000Z";
const SECTION_ONE = "001";
const SECTION_TWO = "002";
const EMPTY_STRING = "";
const NEWLINE = "\n";

const fixedClock = {
  now: () => new Date(FIXED_TIMESTAMP)
};
const yesOptions = normalizeCommonCommandOptions({ yes: true });
const planOptions = normalizeCommonCommandOptions({});

const templateRepository: GitHubTemplateRepository = {
  owner: ORGANIZATION,
  name: TEMPLATE_REPO,
  fullName: `${ORGANIZATION}/${TEMPLATE_REPO}`,
  id: PerformanceNumber.TemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${TEMPLATE_REPO}`,
  isTemplate: true,
  branches: [TEMPLATE_BRANCH],
  files: [README_FILE],
  latestCommitSha: "template-sha"
};

interface ScaleFixtureOptions {
  studentCount: number;
}

const createScaleFixture = ({ studentCount }: ScaleFixtureOptions): string => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-perf-"));
  const termRoot = path.join(repoRoot, "terms", "27s1");
  const rosterRoot = path.join(termRoot, "rosters");
  const assignmentRoot = path.join(termRoot, "assignments", "lab04");

  fs.mkdirSync(rosterRoot, { recursive: true });
  fs.mkdirSync(assignmentRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "course.yml"), createCourseYaml(), "utf8");
  fs.writeFileSync(path.join(termRoot, "term.yml"), createTermYaml(), "utf8");
  fs.writeFileSync(path.join(assignmentRoot, "assignment.yml"), createAssignmentYaml(), "utf8");
  fs.writeFileSync(
    path.join(rosterRoot, "section-001.csv"),
    createRosterCsv(studentCount, SECTION_ONE),
    "utf8"
  );
  fs.writeFileSync(
    path.join(rosterRoot, "section-002.csv"),
    createRosterCsv(studentCount, SECTION_TWO),
    "utf8"
  );

  return repoRoot;
};

const createCourseYaml = (): string => `schema_version: 1
course:
  code: se2030
  title: Software Engineering
  repository: se2030-graider
github:
  organization: ${ORGANIZATION}
  repository_visibility: private
  repo_name_pattern: "{term}-{course}-{assignment}-{github_username}"
  student_permission: push
  faculty_team: faculty
  faculty_permission: admin
  grader_team: graders
  grader_permission: maintain
defaults:
  timezone: Asia/Tokyo
  assignment_type: individual
grading:
  enabled: false
reports:
  formats:
    - markdown
`;

const createTermYaml = (): string => `schema_version: 1
term:
  code: 27s1
  academic_year: 2027
  semester: 1
  display_name: Spring 2027
sections:
  - id: "001"
    roster: rosters/section-001.csv
  - id: "002"
    roster: rosters/section-002.csv
`;

const createAssignmentYaml = (): string => `schema_version: 1
assignment:
  slug: lab04
  title: Lab 04
  type: individual
  status: active
template:
  repository: ${ORGANIZATION}/${TEMPLATE_REPO}
  branch: ${TEMPLATE_BRANCH}
sections:
  - "001"
  - "002"
deadline:
  due_at: "2027-04-15T23:59:00+09:00"
  late_policy: standard
metadata:
  faculty_owner: professor
  lms_assignment_id: null
  grading_category: labs
  points: 100
`;

const createRosterCsv = (studentCount: number, section: string): string => {
  const rows = Array.from({ length: studentCount }, (_, index) => {
    const absoluteIndex =
      index * PerformanceNumber.SectionModulo +
      (section === SECTION_ONE ? PerformanceNumber.FirstIndex : PerformanceNumber.SectionModulo);
    const suffix = String(absoluteIndex).padStart(PerformanceNumber.StudentIdPadLength, "0");

    return `s${suffix},student${suffix},${section},active`;
  });

  return ["student_id,github_username,section,status", ...rows].join(NEWLINE);
};

const createReadyClient = (studentCount: number): FakeGitHubClient => {
  const users = Array.from({ length: studentCount }, (_, index) => {
    const suffix = String(index + PerformanceNumber.FirstIndex).padStart(
      PerformanceNumber.StudentIdPadLength,
      "0"
    );

    return { username: `student${suffix}` };
  });

  return new FakeGitHubClient({
    templateRepositories: [templateRepository],
    users,
    teams: [
      { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
      { org: ORGANIZATION, slug: "graders", name: "Graders" }
    ]
  });
};

const readGeneratedPlanText = (repoRoot: string, generatedFile: string): string =>
  fs.readFileSync(path.join(repoRoot, generatedFile), "utf8");

describe("performance and scale hardening", () => {
  it(
    "TC-PERF-001 supports 150 active students in plan and apply with fake GitHub state",
    async () => {
      const repoRoot = createScaleFixture({
        studentCount: PerformanceNumber.ActiveStudentCount / PerformanceNumber.SectionModulo
      });
      const githubClient = createReadyClient(PerformanceNumber.ActiveStudentCount);

      const planResult = await runPlanCommand({
        cwd: repoRoot,
        assignmentFile: ASSIGNMENT_FILE,
        options: planOptions,
        githubClient,
        clock: fixedClock
      });
      const applyResult = await runApplyCommand({
        cwd: repoRoot,
        assignmentFile: ASSIGNMENT_FILE,
        options: yesOptions,
        githubClient,
        clock: fixedClock,
        retryOptions: { sleep: () => Promise.resolve() }
      });

      expect(planResult.exitCode).toBe(ExitCode.Success);
      expect(applyResult.exitCode).toBe(ExitCode.Success);
      expect(githubClient.mutations.createdRepositories).toHaveLength(
        PerformanceNumber.ActiveStudentCount
      );
    },
    PerformanceNumber.ScaleTestTimeoutMs
  );

  it("TC-PERF-002 validates 500 roster rows and preserves leading-zero section IDs", () => {
    const repoRoot = createScaleFixture({
      studentCount: PerformanceNumber.RosterRowCount / PerformanceNumber.SectionModulo
    });
    const configResult = loadGraiderConfig({ cwd: repoRoot, assignmentFile: ASSIGNMENT_FILE });

    if (configResult.status === "failure") {
      throw new Error("Expected generated performance fixture config to load.");
    }

    const rosterResult = loadAssignmentRosters(configResult.config);

    expect(rosterResult.errors).toEqual([]);
    expect(rosterResult.summary.studentCount).toBe(PerformanceNumber.RosterRowCount);
    expect(rosterResult.students.map((student) => student.section)).toEqual(
      expect.arrayContaining([SECTION_ONE, SECTION_TWO])
    );
  });

  it("TC-PERF-003 produces deterministic plan output under scale with the same clock", async () => {
    const firstRepoRoot = createScaleFixture({
      studentCount: PerformanceNumber.ActiveStudentCount / PerformanceNumber.SectionModulo
    });
    const secondRepoRoot = createScaleFixture({
      studentCount: PerformanceNumber.ActiveStudentCount / PerformanceNumber.SectionModulo
    });

    const first = await runPlanCommand({
      cwd: firstRepoRoot,
      assignmentFile: ASSIGNMENT_FILE,
      options: planOptions,
      githubClient: createReadyClient(PerformanceNumber.ActiveStudentCount),
      clock: fixedClock
    });
    const second = await runPlanCommand({
      cwd: secondRepoRoot,
      assignmentFile: ASSIGNMENT_FILE,
      options: planOptions,
      githubClient: createReadyClient(PerformanceNumber.ActiveStudentCount),
      clock: fixedClock
    });

    expect(first.exitCode).toBe(ExitCode.Success);
    expect(second.exitCode).toBe(ExitCode.Success);
    expect(readGeneratedPlanText(firstRepoRoot, first.generatedFiles[0] ?? EMPTY_STRING)).toBe(
      readGeneratedPlanText(secondRepoRoot, second.generatedFiles[0] ?? EMPTY_STRING)
    );
  });

  it(
    "writes manifest records in deterministic order after large fake apply",
    async () => {
      const repoRoot = createScaleFixture({
        studentCount: PerformanceNumber.ActiveStudentCount / PerformanceNumber.SectionModulo
      });
      const result = await runApplyCommand({
        cwd: repoRoot,
        assignmentFile: ASSIGNMENT_FILE,
        options: yesOptions,
        githubClient: createReadyClient(PerformanceNumber.ActiveStudentCount),
        clock: fixedClock,
        retryOptions: { sleep: () => Promise.resolve() }
      });
      const manifestPath = createManifestPath(repoRoot, "27s1", "lab04");
      const manifestResult = loadManifest(manifestPath.absolutePath, { required: true });

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(manifestResult.status).toBe("loaded");

      if (manifestResult.status === "loaded") {
        const orderedKeys = manifestResult.manifest.repositories.map(
          (record) => `${record.section}:${record.studentId}:${record.repository.name}`
        );
        const sortedKeys = [...orderedKeys].sort();

        expect(orderedKeys).toEqual(sortedKeys);
      }
    },
    PerformanceNumber.ScaleTestTimeoutMs
  );
});
