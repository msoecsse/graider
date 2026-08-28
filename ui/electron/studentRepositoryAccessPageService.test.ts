import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StudentRepositoryAccessPageRequest } from "./ipc";
import {
  generateStudentRepositoryAccessPage,
  getStudentRepositoryAccessPagePath,
  getStudentRepositoryAccessPageStatus
} from "./studentRepositoryAccessPageService";

const assignmentFile = "terms/27s1/assignments/lab02/assignment.yml";
const request = (root: string): StudentRepositoryAccessPageRequest => ({
  courseFolderId: "course",
  courseFolderPath: root,
  assignmentFile,
  pagesRepositoryFolderPath: path.join(root, "pages repo")
});
const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-access-page-"));

const writeFixture = (root: string, course = true): void => {
  fs.writeFileSync(
    path.join(root, "course.yml"),
    course
      ? "course:\n  code: CSC1120\n  title: Data Structures\n  repository: csc1120\ngithub:\n  organization: graider-sandbox\nnotifications:\n  student_access_pages:\n    repository: csc1120/csc1120pages\n    base_url: https://csc1120.github.io/csc1120pages\n    branch: main\n"
      : "course:\n  code: CSC1120\n  title: Data Structures\n",
    "utf8"
  );
  fs.mkdirSync(path.join(root, "pages repo"), { recursive: true });
  fs.mkdirSync(path.join(root, "terms/27s1/rosters"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "terms/27s1/term.yml"),
    'term:\n  code: 27s1\nsections:\n  - id: "001"\n',
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "terms/27s1/rosters/section-001.csv"),
    "student_id,github_username,section,status\nz002,zoe,001,active\na001,ada,001,active\nd001,drop,001,dropped\nh001,hold,001,hold\nm001,missing,001,active\n",
    "utf8"
  );
  fs.mkdirSync(path.dirname(path.join(root, assignmentFile)), { recursive: true });
  fs.writeFileSync(
    path.join(root, assignmentFile),
    'assignment:\n  title: Lab <02>\n  status: active\ntemplate:\n  repository: owner/template\n  branch: main\nsections:\n  - "001"\ndeadline:\n  due_at: "2027-06-15T23:59:00-05:00"\n  late_policy: standard\nmetadata:\n  faculty_owner: professor\n  grading_category: labs\n  points: 100\n',
    "utf8"
  );
  const manifestPath = path.join(root, "terms/27s1/manifests/lab02/manifest.yml");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    "repositories:\n  - student_id: z002\n    github_username: zoe\n    repository:\n      html_url: https://github.com/org/z-repo?x=<unsafe>\n  - student_id: a001\n    github_username: ada\n    repository:\n      html_url: https://github.com/org/a-repo\n",
    "utf8"
  );
};

describe("studentRepositoryAccessPageService", () => {
  const mappings = {
    manifestStatus: "present" as const,
    diagnostics: [],
    mappings: [
      {
        studentId: "z002",
        githubUsername: "zoe",
        targetId: "z002",
        repositoryName: "z-repo",
        repositoryUrl: "https://github.com/org/z-repo?x=<unsafe>"
      },
      {
        studentId: "a001",
        githubUsername: "ada",
        targetId: "a001",
        repositoryName: "a-repo",
        repositoryUrl: "https://github.com/org/a-repo"
      }
    ]
  };
  it("uses the locked path and constructs a Pages URL from course settings", async () => {
    const root = createRoot();
    writeFixture(root);
    expect(getStudentRepositoryAccessPagePath("27s1", "lab02")).toBe(
      "terms/27s1/notifications/lab02/student-repositories.html"
    );
    expect(getStudentRepositoryAccessPagePath("../27s1", "lab02")).toBeNull();
    expect(await getStudentRepositoryAccessPageStatus(request(root), mappings)).toMatchObject({
      status: "partial",
      githubOrganization: "graider-sandbox",
      pagesRepository: "csc1120/csc1120pages",
      pagesBaseUrl: "https://csc1120.github.io/csc1120pages",
      pagesBranch: "main",
      pagesUrl:
        "https://csc1120.github.io/csc1120pages/terms/27s1/notifications/lab02/student-repositories.html",
      summary: { activeStudents: 3, includedStudents: 2, skippedInactive: 2, missingRepository: 1 }
    });
  });

  it("generates only active manifest-backed rows, escapes content, and safely overwrites", async () => {
    const root = createRoot();
    writeFixture(root);
    const first = await generateStudentRepositoryAccessPage(
      request(root),
      mappings,
      () => new Date("2027-01-01T00:00:00.000Z")
    );
    const output = path.join(root, "pages repo", first.outputPath);
    const content = fs.readFileSync(output, "utf8");
    expect(first.exists).toBe(true);
    expect(content).toContain("a001");
    expect(content).toContain("z002");
    expect(content).not.toContain("m001");
    expect(content).not.toContain("ada@example.edu");
    expect(content).not.toContain("Ada");
    expect(content).not.toContain("d001");
    expect(content).toContain("Lab &lt;02&gt;");
    expect(content).toContain("x=&lt;unsafe&gt;");
    expect(content.indexOf("a001")).toBeLessThan(content.indexOf("z002"));
    fs.writeFileSync(output, "old", "utf8");
    await generateStudentRepositoryAccessPage(request(root), mappings);
    expect(fs.readFileSync(output, "utf8")).not.toBe("old");
    expect(fs.existsSync(path.join(root, assignmentFile))).toBe(true);
    expect(fs.existsSync(path.join(root, "terms/27s1/manifests/lab02/manifest.yml"))).toBe(true);
  });

  it("requires a configured Pages target rather than writing into the course repository", async () => {
    const root = createRoot();
    writeFixture(root, false);
    const result = await generateStudentRepositoryAccessPage(request(root), mappings);
    expect(result.pagesUrl).toBeNull();
    expect(result.exists).toBe(false);
    expect(result.diagnostics.map((item) => item.message).join(" ")).toContain("not configured");
  });
});
