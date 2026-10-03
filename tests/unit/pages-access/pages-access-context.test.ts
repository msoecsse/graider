import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import { syncStudentPagesAccess } from "../../../src/pages-access/pages-access-context.js";

const TOKEN = "fake-token";
const OWNER = "graider-sandbox";
const REPO = "csc1120pages";
const CURRENT_ACADEMIC_YEAR = 2027;
const PRIOR_ACADEMIC_YEAR = 2026;

const courseYaml = (withPages: boolean): string => `schema_version: 1
course:
  code: csc1120
  title: Data Structures
  repository: csc1120
github:
  organization: ${OWNER}
  repository_visibility: private
  repo_name_pattern: "{term}-{course}-{assignment}-{github_username}"
  student_permission: admin
  faculty_team: faculty
  faculty_permission: admin
defaults:
  timezone: America/Chicago
  assignment_type: individual
reports:
  formats:
    - markdown
${withPages ? `notifications:\n  student_access_pages:\n    repository: ${OWNER}/${REPO}\n    base_url: https://example.pages.github.io\n    branch: main\n` : ""}`;

const createRoot = (withPages = true): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-pages-access-"));
  fs.writeFileSync(path.join(root, "course.yml"), courseYaml(withPages), "utf8");
  return root;
};

const writeTerm = (
  root: string,
  code: string,
  academicYear: number,
  semester: number,
  rosters: Readonly<Record<string, string>>
): void => {
  const termDirectory = path.join(root, "terms", code);
  fs.mkdirSync(path.join(termDirectory, "rosters"), { recursive: true });
  const sections = Object.keys(rosters)
    .map((id) => `  - id: "${id}"\n    roster: rosters/section-${id}.csv\n`)
    .join("");
  fs.writeFileSync(
    path.join(termDirectory, "term.yml"),
    `schema_version: 1\nterm:\n  code: "${code}"\n  academic_year: ${String(academicYear)}\n  semester: ${String(semester)}\n  display_name: "Term ${code}"\nsections:\n${sections}`,
    "utf8"
  );
  Object.entries(rosters).forEach(([id, rows]) => {
    fs.writeFileSync(
      path.join(termDirectory, "rosters", `section-${id}.csv`),
      `student_id,github_username,section,status\n${rows}`,
      "utf8"
    );
  });
};

const collaborator = (username: string, permission: "pull" | "admin" = "pull") => ({
  owner: OWNER,
  repo: REPO,
  username,
  permission
});

describe("syncStudentPagesAccess", () => {
  it("grants active and on-hold students read access and removes it only from dropped students", async () => {
    const root = createRoot();
    writeTerm(root, "27s1", CURRENT_ACADEMIC_YEAR, 1, {
      "001": "ada,ada,001,active\nhal,hal,001,hold\ndee,dee,001,dropped\nold,old,001,dropped\n"
    });
    const client = new FakeGitHubClient({
      collaboratorPermissions: [collaborator("hal"), collaborator("dee"), collaborator("faculty")]
    });

    const result = await syncStudentPagesAccess({ courseFolderPath: root }, TOKEN, {
      createClient: () => client
    });

    expect(result).toMatchObject({
      status: "success",
      pagesRepository: `${OWNER}/${REPO}`,
      termCode: "27s1",
      granted: ["ada"],
      removed: ["dee"],
      failed: []
    });
    expect(client.mutations.addedCollaborators).toEqual([
      { owner: OWNER, repo: REPO, username: "ada", permission: "pull" }
    ]);
    expect(client.mutations.removedCollaborators).toEqual([
      { owner: OWNER, repo: REPO, username: "dee" }
    ]);
  });

  it("keeps access for a student dropped in one section but active in another", async () => {
    const root = createRoot();
    writeTerm(root, "27s1", CURRENT_ACADEMIC_YEAR, 1, {
      "001": "sam,sam,001,dropped\n",
      "002": "sam,sam,002,active\n"
    });
    const client = new FakeGitHubClient({ collaboratorPermissions: [collaborator("sam")] });

    const result = await syncStudentPagesAccess({ courseFolderPath: root }, TOKEN, {
      createClient: () => client
    });

    expect(result).toMatchObject({ status: "success", granted: [], removed: [] });
    expect(client.mutations.removedCollaborators).toEqual([]);
  });

  it("uses only the most recent term and leaves earlier-term students alone", async () => {
    const root = createRoot();
    writeTerm(root, "26s3", PRIOR_ACADEMIC_YEAR, 3, { "001": "past,past,001,dropped\n" });
    writeTerm(root, "27s1", CURRENT_ACADEMIC_YEAR, 1, { "001": "now,now,001,active\n" });
    const client = new FakeGitHubClient({ collaboratorPermissions: [collaborator("past")] });

    const result = await syncStudentPagesAccess({ courseFolderPath: root }, TOKEN, {
      createClient: () => client
    });

    expect(result).toMatchObject({ termCode: "27s1", granted: ["now"], removed: [] });
    expect(client.mutations.removedCollaborators).toEqual([]);
  });

  it("does not downgrade a student who already has higher access", async () => {
    const root = createRoot();
    writeTerm(root, "27s1", CURRENT_ACADEMIC_YEAR, 1, { "001": "ada,ada,001,active\n" });
    const client = new FakeGitHubClient({
      collaboratorPermissions: [collaborator("ada", "admin")]
    });

    const result = await syncStudentPagesAccess({ courseFolderPath: root }, TOKEN, {
      createClient: () => client
    });

    expect(result).toMatchObject({ status: "success", granted: [] });
    expect(client.mutations.addedCollaborators).toEqual([]);
  });

  it("reports students whose access could not be changed and keeps going", async () => {
    const root = createRoot();
    writeTerm(root, "27s1", CURRENT_ACADEMIC_YEAR, 1, {
      "001": "ada,ada,001,active\nbob,bob,001,active\ndee,dee,001,dropped\n"
    });
    const client = new FakeGitHubClient({ collaboratorPermissions: [collaborator("dee")] });
    client.failNext("addCollaborator", "api_error");
    client.failNext("removeCollaborator", "api_error");

    const result = await syncStudentPagesAccess({ courseFolderPath: root }, TOKEN, {
      createClient: () => client
    });

    expect(result.status).toBe("partial_failure");
    expect(result.granted).toEqual(["bob"]);
    expect(result.failed).toEqual([
      { githubUsername: "ada", action: "grant" },
      { githubUsername: "dee", action: "remove" }
    ]);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("skips removals when any roster in the term cannot be read", async () => {
    const root = createRoot();
    writeTerm(root, "27s1", CURRENT_ACADEMIC_YEAR, 1, {
      "001": "dee,dee,001,dropped\n",
      "002": "broken,broken,002,unknown-status\n"
    });
    const client = new FakeGitHubClient({ collaboratorPermissions: [collaborator("dee")] });

    const result = await syncStudentPagesAccess({ courseFolderPath: root }, TOKEN, {
      createClient: () => client
    });

    expect(result.removed).toEqual([]);
    expect(client.mutations.removedCollaborators).toEqual([]);
    expect(result.diagnostics).toEqual([
      "Roster for section 002 could not be read, so no Pages access was removed."
    ]);
  });

  it("removes access for students in a removed roster unless they are active elsewhere", async () => {
    const root = createRoot();
    writeTerm(root, "27s1", CURRENT_ACADEMIC_YEAR, 1, { "002": "sam,sam,002,active\n" });
    const client = new FakeGitHubClient({
      collaboratorPermissions: [collaborator("gone"), collaborator("sam")]
    });

    const result = await syncStudentPagesAccess(
      {
        courseFolderPath: root,
        removedStudents: { termCode: "27s1", githubUsernames: ["gone", "sam", "never"] }
      },
      TOKEN,
      { createClient: () => client }
    );

    expect(result).toMatchObject({ status: "success", removed: ["gone"] });
    expect(client.mutations.removedCollaborators).toEqual([
      { owner: OWNER, repo: REPO, username: "gone" }
    ]);
  });

  it("ignores a removed roster from an earlier term", async () => {
    const root = createRoot();
    writeTerm(root, "26s3", PRIOR_ACADEMIC_YEAR, 3, { "001": "" });
    writeTerm(root, "27s1", CURRENT_ACADEMIC_YEAR, 1, { "001": "now,now,001,active\n" });
    const client = new FakeGitHubClient({ collaboratorPermissions: [collaborator("past")] });

    const result = await syncStudentPagesAccess(
      {
        courseFolderPath: root,
        removedStudents: { termCode: "26s3", githubUsernames: ["past"] }
      },
      TOKEN,
      { createClient: () => client }
    );

    expect(result.removed).toEqual([]);
    expect(client.mutations.removedCollaborators).toEqual([]);
  });

  it("does nothing when no Pages repository is configured", async () => {
    const root = createRoot(false);
    writeTerm(root, "27s1", CURRENT_ACADEMIC_YEAR, 1, { "001": "ada,ada,001,active\n" });
    const client = new FakeGitHubClient();

    const result = await syncStudentPagesAccess({ courseFolderPath: root }, TOKEN, {
      createClient: () => client
    });

    expect(result.status).toBe("not_configured");
    expect(client.mutations.addedCollaborators).toEqual([]);
  });
});
