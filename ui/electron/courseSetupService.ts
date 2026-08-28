import fs from "node:fs";
import path from "node:path";

import type {
  CourseSetupPreviewResult,
  CourseSetupRequest,
  CourseSetupSaveResult,
  CourseSetupFilePreview,
  CourseSetupDiagnostic
} from "./ipc.js";

const TERM_CODE_PATTERN = /^\d{2}s[123]$/;
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
const REQUIRED_ROSTER_VALUE_HEADERS = ["student_id", "github_username", "section", "status"];
const LINE_ENDING = "\n";

const quoteYaml = (value: string): string => JSON.stringify(value);

const createDiagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const getTermDetails = (
  termCode: string
): { academicYear: number; semester: number; displayName: string } | null => {
  if (!TERM_CODE_PATTERN.test(termCode)) {
    return null;
  }

  const academicYear = 2000 + Number.parseInt(termCode.slice(0, 2), 10);
  const semester = Number.parseInt(termCode.slice(-1), 10);
  const displayName =
    semester === 1
      ? `Fall ${String(academicYear - 1)}`
      : semester === 2
        ? `Spring ${String(academicYear)}`
        : `Summer ${String(academicYear)}`;

  return { academicYear, semester, displayName };
};

const normalizeSections = (
  sectionIds: readonly string[]
): { sections: string[]; diagnostics: CourseSetupDiagnostic[] } => {
  const sections = sectionIds.map((sectionId) => sectionId.trim());
  const diagnostics = [
    ...(sections.some((sectionId) => sectionId.length === 0)
      ? [createDiagnostic("Each section ID is required.")]
      : []),
    ...(new Set(sections).size !== sections.length
      ? [createDiagnostic("Section IDs must be unique after trimming.")]
      : [])
  ];

  return { sections, diagnostics };
};

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
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value.trim());
  return values;
};

const encodeCsvValue = (value: string): string =>
  /[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

const normalizeRoster = (
  sectionId: string,
  content: string
): { content: string | null; diagnostics: CourseSetupDiagnostic[] } => {
  const lines = content.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0] ?? "");
  const isCanonicalHeader = headers.join(",") === ROSTER_HEADERS.join(",");
  const isLegacyHeader = headers.join(",") === LEGACY_ROSTER_HEADERS.join(",");

  if (!isCanonicalHeader && !isLegacyHeader) {
    return {
      content: null,
      diagnostics: [
        createDiagnostic(
          `Roster for section ${sectionId} must use the header ${ROSTER_HEADERS.join(",")}.`
        )
      ]
    };
  }

  const rows = lines.slice(1).map(parseCsvLine);
  const diagnostics = rows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const values = Object.fromEntries(
      ROSTER_HEADERS.map((header) => [header, row[headers.indexOf(header)] ?? ""])
    );
    const missing = REQUIRED_ROSTER_VALUE_HEADERS.filter(
      (header) => values[header]?.trim().length === 0
    );
    const wrongSection = values.section?.trim() !== sectionId;

    return [
      ...missing.map((header) =>
        createDiagnostic(`Roster row ${String(rowNumber)} is missing ${header}.`)
      ),
      ...(wrongSection
        ? [
            createDiagnostic(
              `Roster row ${String(rowNumber)} has section ${values.section ?? ""}; expected ${sectionId}.`
            )
          ]
        : [])
    ];
  });

  return {
    content:
      diagnostics.length > 0
        ? null
        : `${ROSTER_HEADERS.join(",")}${LINE_ENDING}${rows
            .map((row) =>
              ROSTER_HEADERS.map((header) =>
                encodeCsvValue((row[headers.indexOf(header)] ?? "").trim())
              ).join(",")
            )
            .join(LINE_ENDING)}${rows.length > 0 ? LINE_ENDING : ""}`,
    diagnostics
  };
};

const createCourseYaml = (request: CourseSetupRequest): string => `schema_version: 1
course:
  code: ${quoteYaml(request.courseCode.trim())}
  title: ${quoteYaml(request.courseTitle.trim())}
  repository: ${quoteYaml(request.courseCode.trim())}
github:
  organization: ${quoteYaml(request.githubOrganization.trim())}
  repository_visibility: private
  repo_name_pattern: ${quoteYaml("{term}-{course}-{assignment}-{github_username}")}
  student_permission: admin
  faculty_team: faculty
  faculty_permission: admin
  grader_team: graders
  grader_permission: maintain
defaults:
  timezone: America/Chicago
  assignment_type: individual
${
  request.gradingEnabled === false
    ? ""
    : `grading:
  enabled: true
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`
}
reports:
  formats:
    - markdown
    - csv
    - json
${
  request.studentAccessPagesRepository?.trim() === "" ||
  request.studentAccessPagesRepository === undefined
    ? ""
    : `notifications:
  student_access_pages:
    repository: ${quoteYaml(request.studentAccessPagesRepository.trim())}
    base_url: ${quoteYaml(request.studentAccessPagesBaseUrl?.trim() ?? "")}
    branch: ${quoteYaml(request.studentAccessPagesBranch?.trim() || "main")}
`
}`;

const createTermYaml = (termCode: string, sections: readonly string[]): string => {
  const details = getTermDetails(termCode);

  if (details === null) {
    return "";
  }

  return `schema_version: 1
term:
  code: ${quoteYaml(termCode)}
  academic_year: ${String(details.academicYear)}
  semester: ${String(details.semester)}
  display_name: ${quoteYaml(details.displayName)}
sections:
${sections.map((sectionId) => `  - id: ${quoteYaml(sectionId)}\n    roster: rosters/section-${sectionId}.csv`).join(LINE_ENDING)}
`;
};

const getRelativePath = (termCode: string, fileName: string): string =>
  `terms/${termCode}/${fileName}`;

const getFiles = (
  request: CourseSetupRequest
): { files: CourseSetupFilePreview[]; diagnostics: CourseSetupDiagnostic[] } => {
  const { sections, diagnostics: sectionDiagnostics } = normalizeSections(request.sectionIds);
  const termCode = request.termCode.trim();
  const diagnostics = [
    ...(request.courseTitle.trim().length === 0
      ? [createDiagnostic("Course title is required.")]
      : []),
    ...(request.courseCode.trim().length === 0
      ? [createDiagnostic("Course code is required.")]
      : []),
    ...(request.githubOrganization.trim().length === 0
      ? [createDiagnostic("GitHub organization is required.")]
      : []),
    ...((request.studentAccessPagesRepository?.trim() ?? "") === "" &&
    (request.studentAccessPagesBaseUrl?.trim() ?? "") === ""
      ? []
      : !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(
            request.studentAccessPagesRepository?.trim() ?? ""
          )
        ? [createDiagnostic("Student access Pages repository must use owner/repo format.")]
        : !isHttpsUrl(request.studentAccessPagesBaseUrl?.trim() ?? "")
          ? [createDiagnostic("Student access Pages base URL must be a valid HTTPS URL.")]
          : []),
    ...(getTermDetails(termCode) === null
      ? [createDiagnostic("Term code must use YYs1, YYs2, or YYs3.")]
      : []),
    ...(sections.length === 0 ? [createDiagnostic("At least one section ID is required.")] : []),
    ...sectionDiagnostics
  ];
  const uploads = new Map(
    request.rosterUploads.map((upload) => [upload.sectionId.trim(), upload.content])
  );

  for (const upload of request.rosterUploads) {
    if (!sections.includes(upload.sectionId.trim())) {
      diagnostics.push(
        createDiagnostic(`Roster upload references unknown section ${upload.sectionId.trim()}.`)
      );
    }
  }

  const rosterFiles = sections.flatMap((sectionId) => {
    const content = uploads.get(sectionId);
    if (content === undefined) {
      return [];
    }

    const roster = normalizeRoster(sectionId, content);
    diagnostics.push(...roster.diagnostics);
    return roster.content === null
      ? []
      : [
          {
            path: getRelativePath(termCode, `rosters/section-${sectionId}.csv`),
            content: roster.content,
            exists: false
          }
        ];
  });
  const files = [
    { path: "course.yml", content: createCourseYaml(request), exists: false },
    {
      path: getRelativePath(termCode, "term.yml"),
      content: createTermYaml(termCode, sections),
      exists: false
    },
    ...rosterFiles
  ];

  return { files, diagnostics };
};

const withConflicts = (
  courseFolderPath: string,
  files: readonly CourseSetupFilePreview[]
): CourseSetupFilePreview[] =>
  files.map((file) => ({ ...file, exists: fs.existsSync(path.join(courseFolderPath, file.path)) }));

export const previewCourseSetup = (request: CourseSetupRequest): CourseSetupPreviewResult => {
  const generated = getFiles(request);
  const files = withConflicts(request.courseFolderPath, generated.files);

  return {
    status: generated.diagnostics.length === 0 ? "ready" : "invalid",
    files,
    diagnostics: generated.diagnostics,
    hasConflicts: files.some((file) => file.exists)
  };
};

const isContainedPath = (root: string, filePath: string): boolean => {
  const relativePath = path.relative(root, filePath);
  return (
    relativePath.length > 0 && !relativePath.startsWith(`..${path.sep}`) && relativePath !== ".."
  );
};

export const saveCourseSetup = (request: CourseSetupRequest): CourseSetupSaveResult => {
  if (!request.confirmed) {
    return {
      status: "failure",
      writtenFiles: [],
      diagnostics: [createDiagnostic("Course setup must be confirmed before saving.")]
    };
  }

  const preview = previewCourseSetup(request);
  if (preview.status === "invalid") {
    return { status: "failure", writtenFiles: [], diagnostics: preview.diagnostics };
  }

  if (preview.hasConflicts && !request.replaceExisting) {
    return {
      status: "failure",
      writtenFiles: [],
      diagnostics: [createDiagnostic("Existing files must be explicitly replaced before saving.")]
    };
  }

  const root = path.resolve(request.courseFolderPath);
  const writtenFiles: string[] = [];

  try {
    for (const file of preview.files) {
      const absolutePath = path.resolve(root, file.path);
      if (!isContainedPath(root, absolutePath)) {
        return {
          status: "failure",
          writtenFiles,
          diagnostics: [createDiagnostic("Generated path is outside the selected course folder.")]
        };
      }
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, file.content, "utf8");
      writtenFiles.push(file.path);
    }
  } catch {
    return {
      status: "failure",
      writtenFiles,
      diagnostics: [createDiagnostic("Unable to write course setup files.")]
    };
  }

  return { status: "success", writtenFiles, diagnostics: [] };
};
