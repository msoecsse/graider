import fs from "node:fs";
import path from "node:path";

import { isMap, isSeq, parseDocument } from "yaml";

import { normalizeFacultyUsernames } from "./sectionFaculty.js";

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
  RosterSource,
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
const ROSTER_SOURCE_SCHEMA_VERSION = 1;

export interface RosterSaveDependencies {
  readonly updatedBy: string | null;
  readonly now?: () => Date;
}

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const getRosterPath = (termCode: string, sectionId: string): string =>
  `terms/${termCode}/rosters/section-${sectionId}.csv`;
const getRosterSourcePath = (termCode: string, sectionId: string): string =>
  `terms/${termCode}/rosters/section-${sectionId}.source.json`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseRosterSource = (content: string): RosterSource | null => {
  try {
    const envelope = JSON.parse(content) as unknown;
    if (!isRecord(envelope) || envelope.schemaVersion !== ROSTER_SOURCE_SCHEMA_VERSION) return null;
    if (Object.keys(envelope).some((key) => key !== "schemaVersion" && key !== "source"))
      return null;
    const source = envelope.source;
    if (!isRecord(source)) return null;
    if (Object.keys(source).some((key) => !["kind", "updatedAt", "updatedBy"].includes(key)))
      return null;
    if (source.kind !== "csv_upload" && source.kind !== "manual_edit") return null;
    if (
      typeof source.updatedAt !== "string" ||
      source.updatedAt.trim() === "" ||
      Number.isNaN(Date.parse(source.updatedAt)) ||
      new Date(source.updatedAt).toISOString() !== source.updatedAt
    )
      return null;
    if (typeof source.updatedBy !== "string" && source.updatedBy !== null) return null;
    if (typeof source.updatedBy === "string" && source.updatedBy.trim() === "") return null;
    return {
      kind: source.kind,
      updatedAt: source.updatedAt,
      updatedBy: source.updatedBy
    };
  } catch {
    return null;
  }
};

const createRosterSourceContent = (source: RosterSource): string =>
  `${JSON.stringify({ schemaVersion: ROSTER_SOURCE_SCHEMA_VERSION, source }, undefined, 2)}\n`;

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

const getSectionFaculty = (request: RosterSectionRequest): string[] => {
  try {
    const root = parseDocument(
      fs.readFileSync(path.join(request.courseFolderPath, getTermPath(request.termCode)), "utf8")
    ).toJS() as { sections?: unknown };
    const section = Array.isArray(root.sections)
      ? root.sections.find(
          (candidate) =>
            typeof candidate === "object" &&
            candidate !== null &&
            (candidate as Record<string, unknown>).id === request.sectionId
        )
      : undefined;
    const faculty =
      section === undefined ? undefined : (section as Record<string, unknown>).faculty;
    return Array.isArray(faculty)
      ? faculty.filter((username): username is string => typeof username === "string")
      : [];
  } catch {
    return [];
  }
};

const normalizeFaculty = (
  faculty: readonly string[] | undefined
): { faculty: string[] | undefined; diagnostics: CourseSetupDiagnostic[] } => {
  if (faculty === undefined) return { faculty: undefined, diagnostics: [] };
  const normalized = normalizeFacultyUsernames(faculty);
  const diagnostics = normalized.hasBlankEntries
    ? [diagnostic("Faculty usernames cannot be blank.")]
    : [];
  return {
    faculty: normalized.faculty,
    diagnostics
  };
};

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

const createTermContentWithSection = (
  request: RosterSaveRequest,
  faculty: readonly string[]
): string | null => {
  const termPath = path.join(request.courseFolderPath, getTermPath(request.termCode));
  try {
    const document = parseDocument(fs.readFileSync(termPath, "utf8"));
    const root = document.toJS() as { sections?: unknown };
    const sections = root.sections;
    if (!Array.isArray(sections)) return null;
    document.set("sections", [
      ...sections,
      {
        id: request.sectionId.trim(),
        roster: `rosters/section-${request.sectionId.trim()}.csv`,
        faculty
      }
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

const createTermContentWithSectionUpdates = (
  request: RosterSaveRequest,
  faculty: readonly string[] | undefined
): string | null => {
  const termPath = path.join(request.courseFolderPath, getTermPath(request.termCode));
  try {
    const document = parseDocument(fs.readFileSync(termPath, "utf8"));
    const root = document.toJS() as { sections?: unknown };
    if (!Array.isArray(root.sections)) return null;
    const shouldAddRosterReference = !hasRosterReference(request);
    if (!shouldAddRosterReference && faculty === undefined) return null;
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
          ...(faculty === undefined ? {} : { faculty }),
          ...(shouldAddRosterReference
            ? { roster: `rosters/section-${request.sectionId}.csv` }
            : {})
        };
      })
    );
    return document.toString();
  } catch {
    return null;
  }
};

const createTermContentWithoutSection = (request: RosterSectionRequest): string | null => {
  const termPath = path.join(request.courseFolderPath, getTermPath(request.termCode));
  try {
    const document = parseDocument(fs.readFileSync(termPath, "utf8"));
    const root = document.toJS() as { sections?: unknown };
    if (!Array.isArray(root.sections)) return null;
    document.set(
      "sections",
      root.sections.filter(
        (section) =>
          typeof section !== "object" ||
          section === null ||
          (section as Record<string, unknown>).id !== request.sectionId
      )
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
    const sections = document.get("sections", true);
    if (!isSeq(sections)) return null;
    const section = sections.items.find(
      (candidate) => isMap(candidate) && candidate.get("id") === request.sectionId
    );
    if (!isMap(section)) return null;
    section.delete("roster");
    return document.toString();
  } catch {
    return null;
  }
};

const getAssociatedRosterPaths = (request: RosterSectionRequest): string[] => {
  const paths = [getRosterPath(request.termCode, request.sectionId)];
  try {
    const root = parseDocument(
      fs.readFileSync(path.join(request.courseFolderPath, getTermPath(request.termCode)), "utf8")
    ).toJS() as { sections?: unknown };
    const section = Array.isArray(root.sections)
      ? root.sections.find(
          (candidate) =>
            typeof candidate === "object" &&
            candidate !== null &&
            (candidate as Record<string, unknown>).id === request.sectionId
        )
      : undefined;
    const roster =
      section !== undefined && typeof (section as Record<string, unknown>).roster === "string"
        ? (section as Record<string, unknown>).roster
        : null;
    if (roster !== null) paths.push(`terms/${request.termCode}/${roster}`);
  } catch {
    return paths;
  }
  return [...new Set(paths)];
};

export const loadRosterTerms = (courseFolderPath: string): AssignmentSetupTermsResult =>
  loadAssignmentSetupTerms(courseFolderPath);

const loadRosterSource = (
  request: RosterSectionRequest
): { readonly source?: RosterSource; readonly diagnostics: readonly CourseSetupDiagnostic[] } => {
  const root = path.resolve(request.courseFolderPath);
  const sourcePath = path.resolve(root, getRosterSourcePath(request.termCode, request.sectionId));
  if (!isContainedPath(root, sourcePath))
    return {
      diagnostics: [diagnostic("Roster source path is outside the selected course folder.")]
    };
  if (!fs.existsSync(sourcePath)) return { diagnostics: [] };
  try {
    const source = parseRosterSource(fs.readFileSync(sourcePath, "utf8"));
    return source === null
      ? { diagnostics: [diagnostic("Roster source metadata is invalid or unsupported.")] }
      : { source, diagnostics: [] };
  } catch {
    return { diagnostics: [diagnostic("Unable to read roster source metadata.")] };
  }
};

export const getRosterForSection = (request: RosterSectionRequest): RosterLoadResult => {
  const rosterPath = getRosterPath(request.termCode, request.sectionId);
  if (!hasTermSection(request)) {
    return {
      status: "invalid",
      path: rosterPath,
      exists: false,
      rows: [],
      faculty: [],
      diagnostics: [diagnostic("Select an existing term and section before managing a roster.")]
    };
  }

  const root = path.resolve(request.courseFolderPath);
  const absolutePath = path.resolve(root, rosterPath);
  if (!isContainedPath(root, absolutePath)) {
    return {
      status: "invalid",
      path: rosterPath,
      exists: false,
      rows: [],
      faculty: [],
      diagnostics: [diagnostic("Generated path is outside the selected course folder.")]
    };
  }
  const sourceResult = loadRosterSource(request);
  if (!fs.existsSync(absolutePath)) {
    return {
      status: "ready",
      path: rosterPath,
      exists: false,
      rows: [],
      faculty: getSectionFaculty(request),
      diagnostics: sourceResult.diagnostics
    };
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
        faculty: getSectionFaculty(request),
        ...(sourceResult.source === undefined ? {} : { source: sourceResult.source }),
        diagnostics: sourceResult.diagnostics
      };
    }
    return {
      status: "invalid",
      path: rosterPath,
      exists: true,
      rows: [],
      faculty: getSectionFaculty(request),
      diagnostics: [diagnostic(`Roster header must be ${ROSTER_HEADERS.join(",")}.`)]
    };
  } catch {
    return {
      status: "invalid",
      path: rosterPath,
      exists: true,
      rows: [],
      faculty: getSectionFaculty(request),
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
  const rosterExists = fs.existsSync(path.join(request.courseFolderPath, pathValue));
  const isValidSelection = request.createSection ? true : hasTermSection(request);
  const creationDiagnostics = getSectionCreationDiagnostics(request);
  const facultyResult = normalizeFaculty(request.faculty);
  const diagnostics = [
    ...(isValidSelection
      ? []
      : [diagnostic("Select an existing term and section before saving a roster.")]),
    ...creationDiagnostics,
    ...facultyResult.diagnostics,
    ...(!rosterExists && request.sourceKind === undefined
      ? [diagnostic("A source kind is required when creating a roster.")]
      : []),
    ...validateRows(request)
  ];
  return {
    status: diagnostics.length === 0 ? "ready" : "invalid",
    path: pathValue,
    content: createCsv(request.rows),
    exists: rosterExists,
    termPath:
      request.createSection || !hasRosterReference(request) || facultyResult.faculty !== undefined
        ? getTermPath(request.termCode)
        : null,
    termContent:
      request.createSection && creationDiagnostics.length === 0
        ? createTermContentWithSection(request, facultyResult.faculty ?? [])
        : !request.createSection &&
            (!hasRosterReference(request) || facultyResult.faculty !== undefined)
          ? createTermContentWithSectionUpdates(request, facultyResult.faculty)
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

export const saveRoster = (
  request: RosterSaveRequest,
  dependencies: RosterSaveDependencies = { updatedBy: null }
): RosterSaveResult => {
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
  const sourcePath = path.resolve(root, getRosterSourcePath(request.termCode, request.sectionId));
  if (!isContainedPath(root, absolutePath) || !isContainedPath(root, sourcePath)) {
    return {
      status: "failure",
      path: preview.path,
      diagnostics: [diagnostic("Generated path is outside the selected course folder.")]
    };
  }
  const existingSource = loadRosterSource(request).source;
  let source = existingSource;
  let originalRosterContent: string | null = null;
  const rosterTempPath = `${absolutePath}.graider-tmp`;
  const sourceTempPath = `${sourcePath}.graider-tmp`;
  let termPath: string | null = null;
  let originalTermContent: string | null = null;
  try {
    if (fs.existsSync(absolutePath)) originalRosterContent = fs.readFileSync(absolutePath, "utf8");
    if (request.sourceKind !== undefined) {
      source = {
        kind: request.sourceKind,
        updatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
        updatedBy: dependencies.updatedBy
      };
    }
    if (preview.termContent !== null && preview.termPath !== null) {
      if (preview.termPath === undefined || preview.termContent === undefined)
        return {
          status: "failure",
          path: preview.path,
          diagnostics: [diagnostic("Unable to update term.yml for the new section.")]
        };
      termPath = path.resolve(root, preview.termPath);
      if (!isContainedPath(root, termPath))
        return {
          status: "failure",
          path: preview.path,
          diagnostics: [diagnostic("Generated term path is outside the selected course folder.")]
        };
      originalTermContent = fs.readFileSync(termPath, "utf8");
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(rosterTempPath, preview.content, "utf8");
    if (request.sourceKind !== undefined && source !== undefined)
      fs.writeFileSync(sourceTempPath, createRosterSourceContent(source), "utf8");
    if (termPath !== null && typeof preview.termContent === "string")
      fs.writeFileSync(termPath, preview.termContent, "utf8");
    fs.renameSync(rosterTempPath, absolutePath);
    try {
      if (request.sourceKind !== undefined) fs.renameSync(sourceTempPath, sourcePath);
    } catch {
      if (originalRosterContent === null) fs.unlinkSync(absolutePath);
      else fs.writeFileSync(absolutePath, originalRosterContent, "utf8");
      if (termPath !== null && originalTermContent !== null)
        fs.writeFileSync(termPath, originalTermContent, "utf8");
      throw new Error("Unable to save roster source metadata.");
    }
    return {
      status: "success",
      path: preview.path,
      diagnostics: [],
      ...(source === undefined ? {} : { source })
    };
  } catch {
    try {
      if (termPath !== null && originalTermContent !== null)
        fs.writeFileSync(termPath, originalTermContent, "utf8");
    } catch {
      // Preserve the original failure diagnostic when rollback itself is unavailable.
    }
    for (const temporaryPath of [rosterTempPath, sourceTempPath]) {
      try {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      } catch {
        // Best-effort cleanup; the canonical roster/source pair was already preserved.
      }
    }
    return {
      status: "failure",
      path: preview.path,
      diagnostics: [diagnostic("Unable to save roster CSV and source metadata.")]
    };
  }
};

interface RosterRemovalPaths {
  readonly rosterPath: string;
  readonly termPath: string;
  readonly rosterPaths: readonly string[];
  readonly sourcePath: string;
}

const resolveRosterRemovalPaths = (request: RosterRemoveRequest): RosterRemovalPaths | null => {
  const rosterPath = getRosterPath(request.termCode, request.sectionId);
  const root = path.resolve(request.courseFolderPath);
  const termPath = path.resolve(root, getTermPath(request.termCode));
  const rosterPaths = [
    ...new Set(
      getAssociatedRosterPaths(request).map((rosterFilePath) => path.resolve(root, rosterFilePath))
    )
  ];
  const sourcePath = path.resolve(root, getRosterSourcePath(request.termCode, request.sectionId));
  if (
    !rosterPaths.every((rosterFilePath) => isContainedPath(root, rosterFilePath)) ||
    !isContainedPath(root, sourcePath) ||
    !isContainedPath(root, termPath)
  )
    return null;
  return { rosterPath, termPath, rosterPaths, sourcePath };
};

const removeRosterArtifacts = (
  paths: RosterRemovalPaths,
  termContent: string
): RosterRemoveResult => {
  const filesToDelete = [...paths.rosterPaths, paths.sourcePath];

  try {
    const originalTermContent = fs.readFileSync(paths.termPath, "utf8");
    const originalFiles = filesToDelete.flatMap((filePath) =>
      fs.existsSync(filePath) ? [{ filePath, content: fs.readFileSync(filePath) }] : []
    );
    try {
      fs.writeFileSync(paths.termPath, termContent, "utf8");
      for (const filePath of filesToDelete) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch {
      try {
        fs.writeFileSync(paths.termPath, originalTermContent, "utf8");
      } catch {
        // Preserve the removal failure while continuing to restore file snapshots.
      }
      for (const originalFile of originalFiles) {
        try {
          fs.writeFileSync(originalFile.filePath, originalFile.content);
        } catch {
          // Preserve the removal failure while attempting every snapshot restoration.
        }
      }
      throw new Error("Unable to delete roster CSV and source metadata.");
    }
    return { status: "success", path: paths.rosterPath, diagnostics: [] };
  } catch {
    return {
      status: "failure",
      path: paths.rosterPath,
      diagnostics: [diagnostic("Unable to remove roster CSV and update term.yml.")]
    };
  }
};

const getRemovalFailure = (
  request: RosterRemoveRequest,
  confirmationMessage: string
): RosterRemoveResult | null => {
  const rosterPath = getRosterPath(request.termCode, request.sectionId);
  if (!request.confirmed)
    return {
      status: "failure",
      path: rosterPath,
      diagnostics: [diagnostic(confirmationMessage)]
    };
  if (!hasTermSection(request))
    return {
      status: "failure",
      path: rosterPath,
      diagnostics: [diagnostic("Select an existing term and section before removing a roster.")]
    };
  return null;
};

export const removeRoster = (request: RosterRemoveRequest): RosterRemoveResult => {
  const failure = getRemovalFailure(
    request,
    "Roster removal must be confirmed before deleting files."
  );
  if (failure !== null) return failure;
  const paths = resolveRosterRemovalPaths(request);
  if (paths === null)
    return {
      status: "failure",
      path: getRosterPath(request.termCode, request.sectionId),
      diagnostics: [diagnostic("Roster removal path is outside the selected course folder.")]
    };
  if (
    !paths.rosterPaths.some((rosterFilePath) => fs.existsSync(rosterFilePath)) &&
    !hasRosterReference(request)
  )
    return {
      status: "failure",
      path: paths.rosterPath,
      diagnostics: [diagnostic("No configured roster exists for this section.")]
    };
  const termContent = createTermContentWithoutRosterReference(request);
  if (termContent === null)
    return {
      status: "failure",
      path: paths.rosterPath,
      diagnostics: [diagnostic("Unable to update term.yml while removing the roster.")]
    };
  return removeRosterArtifacts(paths, termContent);
};

export const removeSection = (request: RosterRemoveRequest): RosterRemoveResult => {
  const failure = getRemovalFailure(
    request,
    "Section removal must be confirmed before deleting files."
  );
  if (failure !== null) return failure;
  const paths = resolveRosterRemovalPaths(request);
  if (paths === null)
    return {
      status: "failure",
      path: getRosterPath(request.termCode, request.sectionId),
      diagnostics: [diagnostic("Roster removal path is outside the selected course folder.")]
    };
  const termContent = createTermContentWithoutSection(request);
  if (termContent === null)
    return {
      status: "failure",
      path: paths.rosterPath,
      diagnostics: [diagnostic("Unable to update term.yml while removing the roster.")]
    };
  return removeRosterArtifacts(paths, termContent);
};
