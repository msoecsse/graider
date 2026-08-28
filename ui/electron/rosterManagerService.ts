import fs from "node:fs";
import path from "node:path";

import { parseDocument } from "yaml";

import { loadAssignmentSetupTerms } from "./assignmentSetupService.js";
import type {
  AssignmentSetupTermsResult,
  CourseSetupDiagnostic,
  RosterLoadResult,
  RosterPreviewResult,
  RosterRemoveRequest,
  RosterRemoveResult,
  RosterRow,
  RosterSaveRequest,
  RosterSaveResult,
  RosterSectionRequest
} from "./ipc.js";

const ROSTER_HEADERS = ["student_id", "github_username", "section", "status"] as const;
const LEGACY_ROSTER_HEADERS = [
  "student_id",
  "github_username",
  "email",
  "first_name",
  "last_name",
  "section",
  "status"
] as const;
const VALID_STATUSES = ["active", "dropped", "hold"] as const;
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

const hasRosterReference = (request: RosterSectionRequest): boolean => {
  try {
    const root = parseDocument(
      fs.readFileSync(path.join(request.courseFolderPath, getTermPath(request.termCode)), "utf8")
    ).toJS() as { sections?: unknown };
    return (
      Array.isArray(root.sections) &&
      root.sections.some(
        (section) =>
          typeof section === "object" &&
          section !== null &&
          (section as Record<string, unknown>).id === request.sectionId &&
          typeof (section as Record<string, unknown>).roster === "string"
      )
    );
  } catch {
    return false;
  }
};

const createTermContentWithRosterReference = (request: RosterSectionRequest): string | null => {
  const termPath = path.join(request.courseFolderPath, getTermPath(request.termCode));
  try {
    const document = parseDocument(fs.readFileSync(termPath, "utf8"));
    const root = document.toJS() as { sections?: unknown };
    if (!Array.isArray(root.sections)) return null;
    document.set(
      "sections",
      root.sections.map((section) => {
        if (
          typeof section !== "object" ||
          section === null ||
          (section as Record<string, unknown>).id !== request.sectionId
        )
          return section;
        return {
          ...(section as Record<string, unknown>),
          roster: `rosters/section-${request.sectionId}.csv`
        };
      })
    );
    return document.toString();
  } catch {
    return null;
  }
};

const createTermContentWithoutRosterReference = (request: RosterSectionRequest): string | null => {
  const termPath = path.join(request.courseFolderPath, getTermPath(request.termCode));
  try {
    const document = parseDocument(fs.readFileSync(termPath, "utf8"));
    const root = document.toJS() as { sections?: unknown };
    if (!Array.isArray(root.sections)) return null;
    document.set(
      "sections",
      root.sections.map((section) => {
        if (
          typeof section !== "object" ||
          section === null ||
          (section as Record<string, unknown>).id !== request.sectionId
        )
          return section;
        const { roster: _roster, ...withoutRoster } = section as Record<string, unknown>;
        return withoutRoster;
      })
    );
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
    const isCanonicalHeader = header.join(",") === ROSTER_HEADERS.join(",");
    const isLegacyHeader = header.join(",") === LEGACY_ROSTER_HEADERS.join(",");
    if (isCanonicalHeader || isLegacyHeader) {
      return {
        status: "ready",
        path: rosterPath,
        exists: true,
        rows: parseRows(content, header),
        diagnostics: []
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
      section: row.section.trim(),
      status: row.status.trim().toLowerCase()
    };
    for (const [name, value] of Object.entries(values)) {
      if (value.length === 0)
        diagnostics.push(diagnostic(`Roster row ${String(rowNumber)} is missing ${name}.`));
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
      [row.studentId, row.githubUsername, row.section, row.status]
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
    termPath:
      request.createSection || !hasRosterReference(request) ? getTermPath(request.termCode) : null,
    termContent:
      request.createSection && creationDiagnostics.length === 0
        ? createTermContentWithSection(request)
        : !request.createSection && !hasRosterReference(request)
          ? createTermContentWithRosterReference(request)
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
    if (preview.termContent !== null && preview.termPath !== null) {
      if (preview.termPath === undefined || preview.termContent === undefined)
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

export const removeRoster = (request: RosterRemoveRequest): RosterRemoveResult => {
  const rosterPath = getRosterPath(request.termCode, request.sectionId);
  if (!request.confirmed)
    return {
      status: "failure",
      path: rosterPath,
      diagnostics: [diagnostic("Roster removal must be confirmed before deleting files.")]
    };
  if (!hasTermSection(request))
    return {
      status: "failure",
      path: rosterPath,
      diagnostics: [diagnostic("Select an existing term and section before removing a roster.")]
    };

  const root = path.resolve(request.courseFolderPath);
  const absoluteRosterPath = path.resolve(root, rosterPath);
  const termPath = path.resolve(root, getTermPath(request.termCode));
  if (!isContainedPath(root, absoluteRosterPath) || !isContainedPath(root, termPath))
    return {
      status: "failure",
      path: rosterPath,
      diagnostics: [diagnostic("Roster removal path is outside the selected course folder.")]
    };
  const termContent = createTermContentWithoutRosterReference(request);
  if (termContent === null)
    return {
      status: "failure",
      path: rosterPath,
      diagnostics: [diagnostic("Unable to update term.yml while removing the roster.")]
    };
  if (!fs.existsSync(absoluteRosterPath) && !hasRosterReference(request))
    return {
      status: "failure",
      path: rosterPath,
      diagnostics: [diagnostic("No configured roster exists for this section.")]
    };

  try {
    const originalTermContent = fs.readFileSync(termPath, "utf8");
    fs.writeFileSync(termPath, termContent, "utf8");
    try {
      if (fs.existsSync(absoluteRosterPath)) fs.unlinkSync(absoluteRosterPath);
    } catch {
      fs.writeFileSync(termPath, originalTermContent, "utf8");
      throw new Error("Unable to delete roster CSV.");
    }
    return { status: "success", path: rosterPath, diagnostics: [] };
  } catch {
    return {
      status: "failure",
      path: rosterPath,
      diagnostics: [diagnostic("Unable to remove roster CSV and update term.yml.")]
    };
  }
};
