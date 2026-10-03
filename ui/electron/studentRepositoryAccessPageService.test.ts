import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StudentRepositoryAccessPageRequest } from "./ipc";
import {
  generateStudentRepositoryAccessPage,
  getStudentRepositoryAccessPageCloneScriptPattern,
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

  it("generates sectioned, full-width repository links without exposing raw URLs", async () => {
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
    expect(content).toContain('<section class="repository-section" aria-labelledby="section-001">');
    expect(content).toContain(
      '<h2 id="section-001"><a class="clone-script-link" href="clone-csc1120-lab02-001.py" download>Section 001</a></h2>'
    );
    expect(content).toContain(
      '<a class="student-repository-link" href="https://github.com/org/a-repo">a001</a>'
    );
    expect(content).toContain(
      '<a class="student-repository-link" href="https://github.com/org/z-repo?x=&lt;unsafe&gt;">z002</a>'
    );
    expect(content).not.toContain("Open repository");
    expect(content).not.toContain("https://github.com/org/a-repo</");
    expect(content).toContain(".student-repository-link:focus-visible");
    expect(content).toContain("width: 100%;");
    expect(content).not.toContain('<link rel="stylesheet"');
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

  it("writes a per-section Python clone script named after the course, assignment, and section", async () => {
    const root = createRoot();
    writeFixture(root);
    const result = await generateStudentRepositoryAccessPage(request(root), mappings);
    const directory = path.dirname(path.join(root, "pages repo", result.outputPath));
    const script = fs.readFileSync(path.join(directory, "clone-csc1120-lab02-001.py"), "utf8");
    expect(script.startsWith("#!/usr/bin/env python3\n")).toBe(true);
    expect(script).toContain(
      "# (MSOE username, URL to clone using HTTPS, URL to clone using SSH)\n"
    );
    expect(script).toContain(
      [
        "    (",
        '        "a001",',
        '        "https://github.com/org/a-repo",',
        '        "git@github.com:org/a-repo.git",',
        "    ),"
      ].join("\n")
    );
    expect(script).toContain(
      [
        "    (",
        '        "z002",',
        '        "https://github.com/org/z-repo?x=<unsafe>",',
        '        "git@github.com:org/z-repo.git",',
        "    ),"
      ].join("\n")
    );
    expect(script).not.toContain("m001");
    expect(script).not.toContain("d001");
    expect(script).toContain('["git", "ls-remote", "--heads", ssh_url]');
    expect(script).toContain("ssh -o BatchMode=yes");
    expect(script).toContain("already exists, skipped");
    expect(script.indexOf("a001")).toBeLessThan(script.indexOf("z002"));
    expect(getStudentRepositoryAccessPageCloneScriptPattern(result.outputPath)).toBe(
      "terms/27s1/notifications/lab02/clone-*.py"
    );
  });

  it("removes stale Python clone scripts but leaves other files alone", async () => {
    const root = createRoot();
    writeFixture(root);
    const directory = path.join(root, "pages repo", "terms/27s1/notifications/lab02");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "clone-csc1120-lab02-999.py"), "stale", "utf8");
    fs.writeFileSync(path.join(directory, "clone-csc1120-001.sh"), "legacy", "utf8");
    fs.writeFileSync(path.join(directory, "notes.txt"), "keep", "utf8");
    await generateStudentRepositoryAccessPage(request(root), mappings);
    expect(fs.readdirSync(directory).sort()).toEqual([
      "clone-csc1120-001.sh",
      "clone-csc1120-lab02-001.py",
      "notes.txt",
      "student-repositories.html"
    ]);
  });

  it("links the course code to the assignments index it writes at the Pages root", async () => {
    const root = createRoot();
    writeFixture(root);
    fs.writeFileSync(
      path.join(root, "terms/27s1/term.yml"),
      'term:\n  code: 27s1\n  academic_year: 2027\n  semester: 1\n  display_name: "Fall 2026"\nsections:\n  - id: "001"\n',
      "utf8"
    );
    const result = await generateStudentRepositoryAccessPage(request(root), mappings);
    const page = fs.readFileSync(path.join(root, "pages repo", result.outputPath), "utf8");
    const index = fs.readFileSync(path.join(root, "pages repo", "index.html"), "utf8");

    expect(page).toContain(
      '<h1><a class="course-index-link" href="../../../../index.html">CSC1120</a> — Data Structures Lab &lt;02&gt; Repositories</h1>'
    );
    expect(page).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(fs.readFileSync(path.join(root, "pages repo", "robots.txt"), "utf8")).toContain(
      "Disallow: /"
    );
    expect(index).toContain("<h1>CSC1120 Data Structures Fall 2026 Assignments</h1>");
    expect(index).toContain(
      '<a class="assignment-link" href="terms/27s1/notifications/lab02/student-repositories.html">Lab &lt;02&gt;</a> (slug: lab02)'
    );
    expect(result.diagnostics.map((item) => item.message)).not.toContain(
      "Unable to write the assignments page."
    );
  });

  it("omits the clone script link when the course code cannot name a script", async () => {
    const root = createRoot();
    writeFixture(root);
    const coursePath = path.join(root, "course.yml");
    fs.writeFileSync(
      coursePath,
      fs.readFileSync(coursePath, "utf8").replace("code: CSC1120", 'code: "CSC 1120"'),
      "utf8"
    );
    const result = await generateStudentRepositoryAccessPage(request(root), mappings);
    const output = path.join(root, "pages repo", result.outputPath);
    expect(fs.readFileSync(output, "utf8")).toContain('<h2 id="section-001">Section 001</h2>');
    expect(fs.readdirSync(path.dirname(output))).toEqual(["student-repositories.html"]);
  });

  it("displays the MSOE username while retaining the GitHub repository URL", async () => {
    const root = createRoot();
    writeFixture(root);
    fs.appendFileSync(
      path.join(root, "terms/27s1/rosters/section-001.csv"),
      "jonesse,seanjones123,001,active\n",
      "utf8"
    );
    const result = await generateStudentRepositoryAccessPage(request(root), {
      manifestStatus: "present",
      diagnostics: [],
      mappings: [
        {
          studentId: "z002",
          githubUsername: "zoe",
          targetId: "z002",
          repositoryName: "z-repo",
          repositoryUrl: "https://github.com/org/z-repo"
        },
        {
          studentId: "jonesse",
          githubUsername: "seanjones123",
          targetId: "jonesse",
          repositoryName: "lab02-seanjones123",
          repositoryUrl: "https://github.com/org/lab02-seanjones123"
        }
      ]
    });
    const content = fs.readFileSync(path.join(root, "pages repo", result.outputPath), "utf8");

    expect(content).toContain(
      '<a class="student-repository-link" href="https://github.com/org/lab02-seanjones123">jonesse</a>'
    );
    expect(content).not.toContain(
      '<a class="student-repository-link" href="https://github.com/org/lab02-seanjones123">seanjones123</a>'
    );
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
