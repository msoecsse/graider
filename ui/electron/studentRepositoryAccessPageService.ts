import fs from "node:fs";
import path from "node:path";

import { parseDocument } from "yaml";
import { getAssignmentForEdit } from "./assignmentEditService.js";
import { getRosterForSection } from "./rosterManagerService.js";
import type { AssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import type {
  CourseSetupDiagnostic,
  StudentRepositoryAccessPageRequest,
  StudentRepositoryAccessPageResult,
  StudentRepositoryAccessPageRow,
  StudentRepositoryAccessPageSummary
} from "./ipc.js";

const TERM_CODE_PATTERN = /^\d{2}s[123]$/u;
const ASSIGNMENT_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const ASSIGNMENT_FILE_PATTERN =
  /^terms\/(\d{2}s[123])\/assignments\/([A-Za-z0-9][A-Za-z0-9._-]*)\/assignment\.yml$/u;
const HTML_FILE_NAME = "student-repositories.html";

interface CourseContext {
  readonly code: string | null;
  readonly title: string | null;
  readonly githubOrganization: string | null;
  readonly repository: string | null;
  readonly pagesRepository: string | null;
  readonly pagesBaseUrl: string | null;
  readonly pagesBranch: string | null;
}

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const isContainedPath = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== "..";
};
const emptySummary = (): StudentRepositoryAccessPageSummary => ({
  activeStudents: 0,
  includedStudents: 0,
  skippedInactive: 0,
  missingRepository: 0
});
const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);
const isSafeRepositoryUrl = (value: string | null): value is string => {
  if (value === null) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

export const getStudentRepositoryAccessPagePath = (
  termCode: string,
  assignmentSlug: string
): string | null =>
  TERM_CODE_PATTERN.test(termCode) && ASSIGNMENT_SLUG_PATTERN.test(assignmentSlug)
    ? `terms/${termCode}/notifications/${assignmentSlug}/${HTML_FILE_NAME}`
    : null;

const readCourseContext = (courseFolderPath: string): CourseContext | null => {
  try {
    const root = parseDocument(
      fs.readFileSync(path.join(courseFolderPath, "course.yml"), "utf8")
    ).toJS() as {
      course?: { code?: unknown; title?: unknown; repository?: unknown };
      github?: { organization?: unknown };
      notifications?: {
        student_access_pages?: { repository?: unknown; base_url?: unknown; branch?: unknown };
      };
    };
    return {
      code: asString(root.course?.code),
      title: asString(root.course?.title),
      githubOrganization: asString(root.github?.organization),
      repository: asString(root.course?.repository),
      pagesRepository: asString(root.notifications?.student_access_pages?.repository),
      pagesBaseUrl: asString(root.notifications?.student_access_pages?.base_url),
      pagesBranch: asString(root.notifications?.student_access_pages?.branch)
    };
  } catch {
    return null;
  }
};

const getPagesUrl = (
  course: CourseContext | null,
  outputPath: string
): { url: string | null; diagnostics: readonly CourseSetupDiagnostic[] } => {
  const repository = course?.pagesRepository?.trim();
  const baseUrl = course?.pagesBaseUrl?.trim();
  if (
    repository === undefined ||
    repository === "" ||
    !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(repository)
  )
    return {
      url: null,
      diagnostics: [
        diagnostic(
          "Student access Pages repository is not configured. Configure notifications.student_access_pages.repository, base_url, and branch in course.yml."
        )
      ]
    };
  if (baseUrl === undefined || baseUrl === "")
    return {
      url: null,
      diagnostics: [
        diagnostic(
          "Student access Pages base URL is not configured. The page can be generated locally, but a Canvas link cannot be copied."
        )
      ]
    };
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:") throw new Error("Unsafe URL.");
    return { url: `${baseUrl.replace(/\/$/u, "")}/${outputPath}`, diagnostics: [] };
  } catch {
    return {
      url: null,
      diagnostics: [diagnostic("Student access Pages base URL must be a valid HTTPS URL.")]
    };
  }
};

const summarize = (
  rows: readonly StudentRepositoryAccessPageRow[]
): StudentRepositoryAccessPageSummary => ({
  activeStudents: rows.filter((row) => row.status !== "skipped_inactive").length,
  includedStudents: rows.filter((row) => row.status === "included").length,
  skippedInactive: rows.filter((row) => row.status === "skipped_inactive").length,
  missingRepository: rows.filter((row) => row.status === "missing_repository").length
});

const renderPage = (
  course: CourseContext,
  assignmentTitle: string,
  assignmentSlug: string,
  termCode: string,
  rows: readonly StudentRepositoryAccessPageRow[]
): string => {
  const courseLabel = [course.code, course.title]
    .filter((value): value is string => value !== null)
    .join(" — ");
  const title =
    [courseLabel, assignmentTitle]
      .filter((value) => value !== "")
      .join(" ")
      .trim() || assignmentSlug;
  const bodyRows = rows
    .filter((row) => row.status === "included" && row.repositoryUrl !== null)
    .map(
      (row) =>
        `          <tr>\n            <td>${escapeHtml(row.studentId)}</td>\n            <td><a href="${escapeHtml(row.repositoryUrl ?? "")}">Open repository</a></td>\n          </tr>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} Repositories</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)} Repositories</h1>
      <p>Term: ${escapeHtml(termCode)}. Assignment: ${escapeHtml(assignmentTitle)} (${escapeHtml(assignmentSlug)}).</p>
      <p>Find your MSOE username below and open your repository.</p>
      <p>If you do not see your username or cannot access your repository, contact your instructor.</p>
      <table>
        <thead>
          <tr><th scope="col">MSOE username</th><th scope="col">Repository</th></tr>
        </thead>
        <tbody>
${bodyRows}
        </tbody>
      </table>
    </main>
  </body>
</html>
`;
};

const buildResult = (
  request: StudentRepositoryAccessPageRequest,
  mappings: AssignmentRepositoryMappings
): StudentRepositoryAccessPageResult => {
  const assignment = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile);
  if (assignment.model === null)
    return {
      schemaVersion: 1,
      assignmentFile: request.assignmentFile,
      termCode: null,
      assignmentSlug: null,
      outputPath: "",
      pagesRepository: null,
      pagesRepositoryFolderSelected: false,
      pagesUrl: null,
      generatedAt: null,
      exists: false,
      status: "failure",
      summary: emptySummary(),
      rows: [],
      diagnostics: assignment.diagnostics
    };
  const { termCode, assignmentSlug } = assignment.model;
  const outputPath = getStudentRepositoryAccessPagePath(termCode, assignmentSlug);
  if (
    outputPath === null ||
    !ASSIGNMENT_FILE_PATTERN.test(request.assignmentFile.replaceAll("\\", "/"))
  )
    return {
      schemaVersion: 1,
      assignmentFile: request.assignmentFile,
      termCode,
      assignmentSlug,
      outputPath: outputPath ?? "",
      pagesRepository: null,
      pagesRepositoryFolderSelected: false,
      pagesUrl: null,
      generatedAt: null,
      exists: false,
      status: "failure",
      summary: emptySummary(),
      rows: [],
      diagnostics: [diagnostic("Student access page path is invalid.")]
    };
  const course = readCourseContext(request.courseFolderPath);
  const pagesFolderPath = request.pagesRepositoryFolderPath;
  const pagesRepository = course?.pagesRepository ?? null;
  if (pagesRepository === null || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(pagesRepository))
    return {
      schemaVersion: 1,
      assignmentFile: request.assignmentFile,
      termCode,
      assignmentSlug,
      outputPath,
      githubOrganization: course?.githubOrganization ?? null,
      pagesRepository,
      pagesBaseUrl: course?.pagesBaseUrl ?? null,
      pagesBranch: course?.pagesBranch ?? null,
      pagesRepositoryFolderSelected: false,
      pagesUrl: null,
      generatedAt: null,
      exists: false,
      status: "failure",
      summary: emptySummary(),
      rows: [],
      diagnostics: [
        diagnostic(
          "Student access Pages repository is not configured. Configure it before generating a public access page."
        )
      ]
    };
  if (pagesFolderPath === null || pagesFolderPath === undefined || pagesFolderPath.trim() === "")
    return {
      schemaVersion: 1,
      assignmentFile: request.assignmentFile,
      termCode,
      assignmentSlug,
      outputPath,
      pagesRepository,
      pagesRepositoryFolderSelected: false,
      pagesUrl: null,
      generatedAt: null,
      exists: false,
      status: "failure",
      summary: emptySummary(),
      rows: [],
      diagnostics: [
        diagnostic(
          `Pages repository folder is not selected. Select the local clone of ${pagesRepository} before generating the access page.`
        )
      ]
    };
  const pagesRoot = path.resolve(pagesFolderPath);
  try {
    if (!fs.statSync(pagesRoot).isDirectory()) throw new Error("Pages folder missing.");
  } catch {
    return {
      schemaVersion: 1,
      assignmentFile: request.assignmentFile,
      termCode,
      assignmentSlug,
      outputPath,
      pagesRepository,
      pagesRepositoryFolderSelected: false,
      pagesUrl: null,
      generatedAt: null,
      exists: false,
      status: "failure",
      summary: emptySummary(),
      rows: [],
      diagnostics: [
        diagnostic(
          `Pages repository folder is not available. Select the local clone of ${pagesRepository} before generating the access page.`
        )
      ]
    };
  }
  const absoluteOutputPath = path.resolve(pagesRoot, outputPath);
  if (!isContainedPath(pagesRoot, absoluteOutputPath))
    return {
      schemaVersion: 1,
      assignmentFile: request.assignmentFile,
      termCode,
      assignmentSlug,
      outputPath,
      pagesRepository,
      pagesRepositoryFolderSelected: true,
      pagesUrl: null,
      generatedAt: null,
      exists: false,
      status: "failure",
      summary: emptySummary(),
      rows: [],
      diagnostics: [
        diagnostic("Student access page path is outside the selected Pages repository folder.")
      ]
    };
  const pages = getPagesUrl(course, outputPath);
  const sortableRows: { section: string; row: StudentRepositoryAccessPageRow }[] = [];
  const diagnostics: CourseSetupDiagnostic[] = [...mappings.diagnostics, ...pages.diagnostics];
  for (const sectionId of assignment.model.sectionIds) {
    const roster = getRosterForSection({ ...request, termCode, sectionId });
    if (roster.status !== "ready") {
      diagnostics.push(
        ...roster.diagnostics.map((item) => diagnostic(`Roster ${sectionId}: ${item.message}`))
      );
    } else {
      for (const row of roster.rows) {
        const repository = mappings.mappings.find(
          (candidate) =>
            candidate.studentId === row.studentId && candidate.githubUsername === row.githubUsername
        );
        sortableRows.push({
          section: row.section,
          row: {
            studentId: row.studentId,
            githubUsername: row.githubUsername,
            repositoryUrl: isSafeRepositoryUrl(repository?.repositoryUrl ?? null)
              ? (repository?.repositoryUrl ?? null)
              : null,
            status:
              row.status === "active"
                ? repository?.repositoryUrl === null || repository === undefined
                  ? "missing_repository"
                  : "included"
                : "skipped_inactive"
          }
        });
      }
    }
  }
  sortableRows.sort(
    (left, right) =>
      left.section.localeCompare(right.section) ||
      left.row.studentId.localeCompare(right.row.studentId)
  );
  const rows = sortableRows.map((entry) => entry.row);
  const summary = summarize(rows);
  if (mappings.manifestStatus === "not_applied")
    diagnostics.push(
      diagnostic(
        "Repositories not created yet. Apply the assignment before generating the access page."
      )
    );
  if (summary.missingRepository > 0)
    diagnostics.push(
      diagnostic(
        `${String(summary.missingRepository)} active student(s) are missing repository links and will be excluded from the access page.`
      )
    );
  const exists = fs.existsSync(absoluteOutputPath);
  let generatedAt: string | null = null;
  if (exists) {
    try {
      generatedAt = fs.statSync(absoluteOutputPath).mtime.toISOString();
    } catch {
      /* status remains usable */
    }
  }
  const status =
    mappings.diagnostics.length > 0 || course === null
      ? "failure"
      : summary.includedStudents === 0
        ? "not_ready"
        : summary.missingRepository > 0
          ? "partial"
          : exists
            ? "generated"
            : "ready";
  return {
    schemaVersion: 1,
    assignmentFile: request.assignmentFile,
    termCode,
    assignmentSlug,
    outputPath,
    githubOrganization: course?.githubOrganization ?? null,
    pagesRepository,
    pagesBaseUrl: course?.pagesBaseUrl ?? null,
    pagesBranch: course?.pagesBranch ?? null,
    pagesRepositoryFolderSelected: true,
    pagesUrl: pages.url,
    generatedAt,
    exists,
    status,
    summary,
    rows,
    diagnostics
  };
};

export const getStudentRepositoryAccessPageStatus = (
  request: StudentRepositoryAccessPageRequest,
  mappings: AssignmentRepositoryMappings
): Promise<StudentRepositoryAccessPageResult> => Promise.resolve(buildResult(request, mappings));

export const generateStudentRepositoryAccessPage = (
  request: StudentRepositoryAccessPageRequest,
  mappings: AssignmentRepositoryMappings,
  now: () => Date = () => new Date()
): Promise<StudentRepositoryAccessPageResult> => {
  const result = buildResult(request, mappings);
  if (result.status === "failure" || result.termCode === null || result.assignmentSlug === null)
    return Promise.resolve(result);
  const course = readCourseContext(request.courseFolderPath);
  if (course === null)
    return Promise.resolve({
      ...result,
      status: "failure",
      diagnostics: [
        ...result.diagnostics,
        diagnostic("Unable to load course.yml for the student access page.")
      ]
    });
  try {
    const pagesFolderPath = request.pagesRepositoryFolderPath;
    if (pagesFolderPath === null || pagesFolderPath === undefined)
      throw new Error("Pages folder missing.");
    const root = path.resolve(pagesFolderPath);
    const absolutePath = path.resolve(root, result.outputPath);
    if (!isContainedPath(root, absolutePath)) throw new Error("Unsafe output path.");
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const temporaryPath = `${absolutePath}.${process.pid}.${now().getTime()}.tmp`;
    const assignment = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile);
    if (assignment.model === null) throw new Error("Assignment unavailable.");
    fs.writeFileSync(
      temporaryPath,
      renderPage(
        course,
        assignment.model.assignmentTitle,
        result.assignmentSlug,
        result.termCode,
        result.rows
      ),
      "utf8"
    );
    fs.renameSync(temporaryPath, absolutePath);
    return Promise.resolve({
      ...result,
      exists: true,
      generatedAt: now().toISOString(),
      status: result.summary.missingRepository > 0 ? "partial" : "generated"
    });
  } catch {
    return Promise.resolve({
      ...result,
      status: "failure",
      diagnostics: [
        ...result.diagnostics,
        diagnostic("Unable to write the student repository access page.")
      ]
    });
  }
};
