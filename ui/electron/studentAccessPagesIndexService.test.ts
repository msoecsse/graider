import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getGraiderStudentAccessPagesRootFiles,
  getStudentAccessPagesIndexLink,
  isGraiderStudentAccessPagesIndex,
  writeStudentAccessPagesIndex,
  writeStudentAccessPagesRobots
} from "./studentAccessPagesIndexService";

const course = { code: "SWE4211", title: "Real Time Systems" };
const now = (): Date => new Date("2026-10-03T12:00:00Z");
const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-pages-index-"));
const pagesRoot = (root: string): string => path.join(root, "pages repo");
const indexPath = (root: string): string => path.join(pagesRoot(root), "index.html");

const writeTerm = (
  root: string,
  termCode: string,
  academicYear: number,
  semester: number,
  displayName: string
): void => {
  fs.mkdirSync(path.join(root, "terms", termCode), { recursive: true });
  fs.writeFileSync(
    path.join(root, "terms", termCode, "term.yml"),
    `schema_version: 1\nterm:\n  code: "${termCode}"\n  academic_year: ${String(academicYear)}\n  semester: ${String(semester)}\n  display_name: "${displayName}"\nsections:\n  - id: "121"\n`,
    "utf8"
  );
};

const writeAssignment = (
  root: string,
  termCode: string,
  slug: string,
  title: string,
  options: { readonly createdAt?: readonly string[]; readonly page?: boolean } = {}
): void => {
  const assignmentFile = path.join(root, "terms", termCode, "assignments", slug, "assignment.yml");
  fs.mkdirSync(path.dirname(assignmentFile), { recursive: true });
  fs.writeFileSync(
    assignmentFile,
    `schema_version: 1\nassignment:\n  slug: "${slug}"\n  title: "${title}"\n  type: individual\n  status: active\nsections:\n  - "121"\n`,
    "utf8"
  );
  const createdAt = options.createdAt ?? [];
  if (createdAt.length > 0) {
    const manifestFile = path.join(root, "terms", termCode, "manifests", slug, "manifest.yml");
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
    fs.writeFileSync(
      manifestFile,
      `repositories:\n${createdAt.map((value) => `  - student_id: s\n    repository:\n      created_at: ${value}\n`).join("")}`,
      "utf8"
    );
  }
  if (options.page ?? true) {
    const pageFile = path.join(
      pagesRoot(root),
      "terms",
      termCode,
      "notifications",
      slug,
      "student-repositories.html"
    );
    fs.mkdirSync(path.dirname(pageFile), { recursive: true });
    fs.writeFileSync(pageFile, "<!doctype html>\n", "utf8");
  }
};

describe("studentAccessPagesIndexService", () => {
  it("lists the most recent term's generated pages, newest first, with titles and slugs", () => {
    const root = createRoot();
    writeTerm(root, "27s1", 2027, 1, "Fall 2026");
    writeTerm(root, "26s3", 2026, 3, "Summer 2026");
    writeAssignment(root, "26s3", "old", "Old Term Lab", { createdAt: ["2026-07-01T00:00:00Z"] });
    writeAssignment(root, "27s1", "io2", "lab2io", { createdAt: ["2026-09-08T00:00:00Z"] });
    writeAssignment(root, "27s1", "lab5lights", "Lab 5 <Lights>", {
      createdAt: ["2026-09-30T18:00:00Z", "2026-09-30T17:43:21.720Z"]
    });
    writeAssignment(root, "27s1", "ant", "Anticipation", { createdAt: ["2026-09-23T00:00:00Z"] });
    writeAssignment(root, "27s1", "undated", "Undated");
    writeAssignment(root, "27s1", "unapplied", "Not Generated", {
      createdAt: ["2026-10-01T00:00:00Z"],
      page: false
    });

    expect(writeStudentAccessPagesIndex(root, pagesRoot(root), course, now)).toEqual([]);

    const html = fs.readFileSync(indexPath(root), "utf8");
    expect(html).toContain("<title>SWE4211 Real Time Systems Fall 2026 Assignments</title>");
    expect(html).toContain("<h1>SWE4211 Real Time Systems Fall 2026 Assignments</h1>");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain(
      '<li><a class="assignment-link" href="terms/27s1/notifications/lab5lights/student-repositories.html">Lab 5 &lt;Lights&gt;</a> (slug: lab5lights)</li>'
    );
    const order = ["lab5lights", "ant", "io2", "undated"].map((slug) =>
      html.indexOf(`(slug: ${slug})`)
    );
    expect(order.every((position) => position > 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(html).not.toContain("Old Term Lab");
    expect(html).not.toContain("(slug: old)");
    expect(html).not.toContain("unapplied");
    expect(isGraiderStudentAccessPagesIndex(pagesRoot(root))).toBe(true);
  });

  it("uses the most recent term even when it has no generated pages yet", () => {
    const root = createRoot();
    writeTerm(root, "27s1", 2027, 1, "Fall 2026");
    writeTerm(root, "27s2", 2027, 2, "Spring 2027");
    writeAssignment(root, "27s1", "ant", "Anticipation", { createdAt: ["2026-09-23T00:00:00Z"] });

    expect(writeStudentAccessPagesIndex(root, pagesRoot(root), course, now)).toEqual([]);

    const html = fs.readFileSync(indexPath(root), "utf8");
    expect(html).toContain("<h1>SWE4211 Real Time Systems Spring 2027 Assignments</h1>");
    expect(html).not.toContain('assignment-link" href');
  });

  it("rewrites its own index but leaves an index.html it did not create untouched", () => {
    const root = createRoot();
    writeTerm(root, "27s1", 2027, 1, "Fall 2026");
    writeAssignment(root, "27s1", "ant", "Anticipation", { createdAt: ["2026-09-23T00:00:00Z"] });
    expect(writeStudentAccessPagesIndex(root, pagesRoot(root), course, now)).toEqual([]);
    writeAssignment(root, "27s1", "io2", "lab2io", { createdAt: ["2026-09-08T00:00:00Z"] });
    expect(writeStudentAccessPagesIndex(root, pagesRoot(root), course, now)).toEqual([]);
    expect(fs.readFileSync(indexPath(root), "utf8")).toContain("(slug: io2)");

    fs.writeFileSync(indexPath(root), "<p>Hand-made</p>\n", "utf8");
    const diagnostics = writeStudentAccessPagesIndex(root, pagesRoot(root), course, now);

    expect(diagnostics.map((item) => item.message)).toEqual([
      "The Pages repository already has an index.html that Graider did not create, so the assignments page was not updated."
    ]);
    expect(fs.readFileSync(indexPath(root), "utf8")).toBe("<p>Hand-made</p>\n");
    expect(isGraiderStudentAccessPagesIndex(pagesRoot(root))).toBe(false);
  });

  it("writes a robots.txt that blocks all crawlers but leaves one it did not create untouched", () => {
    const root = createRoot();
    fs.mkdirSync(pagesRoot(root), { recursive: true });
    const robotsPath = path.join(pagesRoot(root), "robots.txt");

    expect(writeStudentAccessPagesRobots(pagesRoot(root), now)).toEqual([]);
    expect(fs.readFileSync(robotsPath, "utf8")).toBe(
      "# Generated by Graider student access pages\nUser-agent: *\nDisallow: /\n"
    );
    expect(writeStudentAccessPagesRobots(pagesRoot(root), now)).toEqual([]);
    expect(getGraiderStudentAccessPagesRootFiles(pagesRoot(root))).toEqual(["robots.txt"]);

    fs.writeFileSync(robotsPath, "User-agent: *\nAllow: /\n", "utf8");
    expect(writeStudentAccessPagesRobots(pagesRoot(root), now).map((item) => item.message)).toEqual(
      [
        "The Pages repository already has a robots.txt that Graider did not create, so it was not updated."
      ]
    );
    expect(fs.readFileSync(robotsPath, "utf8")).toBe("User-agent: *\nAllow: /\n");
    expect(getGraiderStudentAccessPagesRootFiles(pagesRoot(root))).toEqual([]);
  });

  it("links a student repository page back to the root index", () => {
    expect(
      getStudentAccessPagesIndexLink(
        "terms/27s1/notifications/lab5lights/student-repositories.html"
      )
    ).toBe("../../../../index.html");
  });
});
