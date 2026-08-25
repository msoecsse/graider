import fs from "node:fs";
import path from "node:path";

import { parseDocument } from "yaml";

import { loadAssignmentSetupTerms } from "./assignmentSetupService.js";
import type {
  AssignmentSetupTermsResult,
  CourseSetupDiagnostic,
  RosterLoadResult,
  RosterPreviewResult,
  RosterRow,
  RosterSaveRequest,
  RosterSaveResult,
  RosterSectionRequest
} from "./ipc.js";

const ROSTER_HEADERS = [
  "student_id",
  "github_username",
  "email",
  "first_name",
  "last_name",
  "section",
  "status"
] as const;
const LEGACY_HEADERS = ["student_id", "github_username", "section", "status"] as const;
const VALID_STATUSES = ["active", "dropped", "hold"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const SECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const getRosterPath = (termCode: string, sectionId: string): string =>
  `terms/${termCode}/rosters/section-${sectionId}.csv`;

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? "";
    const nextCharacter = line[index + 1] ?? "";
    if (character === '"' && inQuotes && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
};

const encodeCsvValue = (value: string): string =>
  /[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

const parseRows = (content: string, header: readonly string[]): RosterRow[] =>
  content
    .split(/\r?\n/u)
    .slice(1)
    .filter((line) => line.length > 0)
    .map(parseCsvLine)
    .map((values) => {
      const fields = Object.fromEntries(
        header.map((name, index) => [name, (values[index] ?? "").trim()])
      );
      return {
        studentId: fields.student_id ?? "",
        githubUsername: fields.github_username ?? "",
        email: fields.email ?? "",
        firstName: fields.first_name ?? "",
        lastName: fields.last_name ?? "",
        section: fields.section ?? "",
        status: (fields.status ?? "").toLowerCase()
      };
    });

const hasTermSection = (request: RosterSectionRequest): boolean => {
  const terms = loadAssignmentSetupTerms(request.courseFolderPath).terms;
  const term = terms.find((candidate) => candidate.code === request.termCode);
  return term?.sections.includes(request.sectionId) ?? false;
};

const getTermPath = (termCode: string): string => `terms/${termCode}/term.yml`;
const getSectionCreationDiagnostics = (request: RosterSaveRequest): CourseSetupDiagnostic[] => {
  if (!request.createSection) return [];
  const sectionId = request.sectionId.trim();
  const term = loadAssignmentSetupTerms(request.courseFolderPath).terms.find(
    (candidate) => candidate.code === request.termCode
  );
  if (sectionId.length === 0) return [diagnostic("Section ID is required.")];
  if (sectionId !== request.sectionId)
    return [diagnostic("Section ID cannot begin or end with whitespace.")];
  if (!SECTION_ID_PATTERN.test(sectionId))
    return [
      diagnostic(
        "Section ID must use letters, numbers, hyphens, or underscores and cannot contain path separators."
      )
    ];
  if (term === undefined) return [diagnostic("Select an existing term before adding a section.")];
  if (term.sections.includes(sectionId))
    return [diagnostic(`Section ${sectionId} already exists in this term.`)];
  return [];
};

const createTermContentWithSection = (request: RosterSaveRequest): string | null => {
  const termPath = path.join(request.courseFolderPath, getTermPath(request.termCode));
  try {
    const document = parseDocument(fs.readFileSync(termPath, "utf8"));
    const root = document.toJS() as { sections?: unknown };
    const sections = root.sections;
    if (!Array.isArray(sections)) return null;
    document.set("sections", [
      ...sections,
      { id: request.sectionId.trim(), roster: `rosters/section-${request.sectionId.trim()}.csv` }
    ]);
    return document.toString();
  } catch {
    return null;
  }
};

export const loadRosterTerms = (courseFolderPath: string): AssignmentSetupTermsResult =>
  loadAssignmentSetupTerms(courseFolderPath);

export const getRosterForSection = (request: RosterSectionRequest): RosterLoadResult => {
  const rosterPath = getRosterPath(request.termCode, request.sectionId);
  if (!hasTermSection(request)) {
    return {
      status: "invalid",
      path: rosterPath,
      exists: false,
      rows: [],
      diagnostics: [diagnostic("Select an existing term and section before managing a roster.")]
    };
  }

  const absolutePath = path.join(request.courseFolderPath, rosterPath);
  if (!fs.existsSync(absolutePath)) {
    return { status: "ready", path: rosterPath, exists: false, rows: [], diagnostics: [] };
  }

  try {
    const content = fs.readFileSync(absolutePath, "utf8");
    const header = parseCsvLine(content.split(/\r?\n/u)[0] ?? "");
    if (header.join(",") === ROSTER_HEADERS.join(",")) {
      return {
        status: "ready",
        path: rosterPath,
        exists: true,
        rows: parseRows(content, header),
        diagnostics: []
      };
    }
    if (header.join(",") === LEGACY_HEADERS.join(",")) {
      return {
        status: "migration_required",
        path: rosterPath,
        exists: true,
        rows: parseRows(content, header),
        diagnostics: [
          diagnostic(
            "This roster uses the legacy four-column schema. Review the missing profile fields, then explicitly save a canonical replacement."
          )
        ]
      };
    }
    return {
      status: "invalid",
      path: rosterPath,
      exists: true,
      rows: [],
      diagnostics: [diagnostic(`Roster header must be ${ROSTER_HEADERS.join(",")}.`)]
    };
  } catch {
    return {
      status: "invalid",
      path: rosterPath,
      exists: true,
      rows: [],
      diagnostics: [diagnostic("Unable to read roster CSV.")]
    };
  }
};

const validateRows = (request: RosterSaveRequest): CourseSetupDiagnostic[] => {
  const diagnostics: CourseSetupDiagnostic[] = [];
  const ids = new Set<string>();
  const usernames = new Set<string>();

  for (const [index, row] of request.rows.entries()) {
    const rowNumber = index + 2;
    const values = {
      studentId: row.studentId.trim(),
      githubUsername: row.githubUsername.trim(),
      email: row.email.trim(),
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      section: row.section.trim(),
      status: row.status.trim().toLowerCase()
    };
    for (const [name, value] of Object.entries(values)) {
      if (value.length === 0)
        diagnostics.push(diagnostic(`Roster row ${String(rowNumber)} is missing ${name}.`));
    }
    if (values.email.length > 0 && !EMAIL_PATTERN.test(values.email)) {
      diagnostics.push(diagnostic(`Roster row ${String(rowNumber)} has an invalid email address.`));
    }
    if (values.section.length > 0 && values.section !== request.sectionId) {
      diagnostics.push(
        diagnostic(
          `Roster row ${String(rowNumber)} has section ${values.section}; expected ${request.sectionId}.`
        )
      );
    }
    if (
      values.status.length > 0 &&
      !VALID_STATUSES.includes(values.status as (typeof VALID_STATUSES)[number])
    ) {
      diagnostics.push(
        diagnostic(`Roster row ${String(rowNumber)} has invalid status ${values.status}.`)
      );
    }
    if (values.studentId.length > 0 && ids.has(values.studentId)) {
      diagnostics.push(diagnostic(`Duplicate student_id ${values.studentId}.`));
    }
    if (values.githubUsername.length > 0 && usernames.has(values.githubUsername)) {
      diagnostics.push(diagnostic(`Duplicate github_username ${values.githubUsername}.`));
    }
    ids.add(values.studentId);
    usernames.add(values.githubUsername);
  }

  return diagnostics;
};

const createCsv = (rows: readonly RosterRow[]): string => {
  const content = rows
    .map((row) =>
      [
        row.studentId,
        row.githubUsername,
        row.email,
        row.firstName,
        row.lastName,
        row.section,
        row.status
      ]
        .map((value) => encodeCsvValue(value.trim()))
        .join(",")
    )
    .join("\n");
  return `${ROSTER_HEADERS.join(",")}\n${content.length === 0 ? "" : `${content}\n`}`;
};

export const previewRosterSave = (request: RosterSaveRequest): RosterPreviewResult => {
  const pathValue = getRosterPath(request.termCode, request.sectionId);
  const isValidSelection = request.createSection ? true : hasTermSection(request);
  const creationDiagnostics = getSectionCreationDiagnostics(request);
  const diagnostics = [
    ...(isValidSelection
      ? []
      : [diagnostic("Select an existing term and section before saving a roster.")]),
    ...creationDiagnostics,
    ...validateRows(request)
  ];
  return {
    status: diagnostics.length === 0 ? "ready" : "invalid",
    path: pathValue,
    content: createCsv(request.rows),
    exists: fs.existsSync(path.join(request.courseFolderPath, pathValue)),
    termPath: request.createSection ? getTermPath(request.termCode) : null,
    termContent:
      request.createSection && creationDiagnostics.length === 0
        ? createTermContentWithSection(request)
        : null,
    diagnostics
  };
};

const isContainedPath = (root: string, filePath: string): boolean => {
  const relativePath = path.relative(root, filePath);
  return (
    relativePath.length > 0 && !relativePath.startsWith(`..${path.sep}`) && relativePath !== ".."
  );
};

export const saveRoster = (request: RosterSaveRequest): RosterSaveResult => {
  const preview = previewRosterSave(request);
  if (!request.confirmed) {
    return {
      status: "failure",
      path: preview.path,
      diagnostics: [diagnostic("Roster save must be confirmed before saving.")]
    };
  }
  if (preview.status === "invalid")
    return { status: "failure", path: preview.path, diagnostics: preview.diagnostics };

  const root = path.resolve(request.courseFolderPath);
  const absolutePath = path.resolve(root, preview.path);
  if (!isContainedPath(root, absolutePath)) {
    return {
      status: "failure",
      path: preview.path,
      diagnostics: [diagnostic("Generated path is outside the selected course folder.")]
    };
  }
  try {
    if (request.createSection) {
      if (
        preview.termPath === null ||
        preview.termPath === undefined ||
        preview.termContent === null ||
        preview.termContent === undefined
      )
        return {
          status: "failure",
          path: preview.path,
          diagnostics: [diagnostic("Unable to update term.yml for the new section.")]
        };
      const termPath = path.resolve(root, preview.termPath);
      if (!isContainedPath(root, termPath))
        return {
          status: "failure",
          path: preview.path,
          diagnostics: [diagnostic("Generated term path is outside the selected course folder.")]
        };
      fs.writeFileSync(termPath, preview.termContent, "utf8");
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, preview.content, "utf8");
    return { status: "success", path: preview.path, diagnostics: [] };
  } catch {
    return {
      status: "failure",
      path: preview.path,
      diagnostics: [diagnostic("Unable to save roster CSV.")]
    };
  }
};
