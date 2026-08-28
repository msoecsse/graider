import fs from "node:fs";
import path from "node:path";

import type {
  AssignmentSetupFilePreview,
  AssignmentSetupPreviewResult,
  AssignmentSetupRequest,
  AssignmentSetupSaveResult,
  AssignmentSetupTerm,
  AssignmentSetupTermsResult,
  CourseSetupDiagnostic
} from "./ipc.js";

const TERM_CODE_PATTERN = /^\d{2}s[123]$/;
const ASSIGNMENT_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ISO_DATE_TIME_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const quoteYaml = (value: string): string => JSON.stringify(value);

const decodeYamlScalar = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return typeof parsed === "string" ? parsed : "";
    } catch {
      return "";
    }
  }
  return trimmed.replace(/^'|'$/gu, "");
};

const parseTermFile = (content: string): AssignmentSetupTerm | null => {
  const codeMatch = content.match(/^\s{2}code:\s*(.+)$/mu);
  const sections = [...content.matchAll(/^\s{2}-\s+id:\s*(.+)$/gmu)].map((match) =>
    decodeYamlScalar(match[1] ?? "")
  );
  const code = codeMatch === null ? "" : decodeYamlScalar(codeMatch[1] ?? "");

  return TERM_CODE_PATTERN.test(code) && sections.every(Boolean) ? { code, sections } : null;
};

export const loadAssignmentSetupTerms = (courseFolderPath: string): AssignmentSetupTermsResult => {
  const courseConfigPath = path.join(courseFolderPath, "course.yml");
  const termsRoot = path.join(courseFolderPath, "terms");
  if (!fs.existsSync(courseConfigPath) || !fs.existsSync(termsRoot)) {
    return {
      terms: [],
      diagnostics: [diagnostic("Course setup must be completed before creating an assignment.")]
    };
  }

  try {
    const terms = fs
      .readdirSync(termsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        try {
          const parsed = parseTermFile(
            fs.readFileSync(path.join(termsRoot, entry.name, "term.yml"), "utf8")
          );
          return parsed === null || parsed.code !== entry.name ? [] : [parsed];
        } catch {
          return [];
        }
      })
      .sort((left, right) => left.code.localeCompare(right.code));

    return terms.length > 0
      ? { terms, diagnostics: [] }
      : {
          terms: [],
          diagnostics: [diagnostic("No valid terms were found. Complete Course Setup first.")]
        };
  } catch {
    return { terms: [], diagnostics: [diagnostic("Unable to load course terms.")] };
  }
};

export const normalizeTemplateRepository = (value: string): string | null => {
  const trimmed = value.trim().replace(/\/$/u, "");
  const githubMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/u);
  const repository = githubMatch?.[1] ?? trimmed;
  const withoutGitSuffix = repository.replace(/\.git$/u, "");
  return REPOSITORY_PATTERN.test(withoutGitSuffix) ? withoutGitSuffix : null;
};

const getRelativePath = (request: AssignmentSetupRequest): string =>
  `terms/${request.termCode.trim()}/assignments/${request.assignmentSlug.trim()}/assignment.yml`;

const createAssignmentYaml = (
  request: AssignmentSetupRequest,
  repository: string | null
): string => {
  const sections = request.sectionIds
    .map((sectionId) => `  - ${quoteYaml(sectionId.trim())}`)
    .join("\n");
  const grading = request.gradingEnabled
    ? "grading:\n  enabled: true\n  workflow: .github/workflows/grade.yml\n  artifact: grading-results\n  result_file: grading-results.json\n"
    : "grading:\n  enabled: false\n  mode: no-grading\n";
  const deadline =
    request.dueAt.trim() === ""
      ? ""
      : `deadline:\n  due_at: ${quoteYaml(request.dueAt.trim())}\n  late_policy: standard\n`;
  const points = request.points === null ? "" : `  points: ${String(request.points)}\n`;
  const facultyOwner =
    request.facultyOwner.trim() === ""
      ? ""
      : `  faculty_owner: ${quoteYaml(request.facultyOwner.trim())}\n`;
  const lmsAssignmentId =
    request.lmsAssignmentId.trim() === ""
      ? ""
      : `  lms_assignment_id: ${quoteYaml(request.lmsAssignmentId.trim())}\n`;
  const gradingCategory =
    request.gradingCategory.trim() === ""
      ? ""
      : `  grading_category: ${quoteYaml(request.gradingCategory.trim())}\n`;
  const metadata = `${facultyOwner}${lmsAssignmentId}${gradingCategory}${points}`;
  const metadataBlock = metadata === "" ? "" : `metadata:\n${metadata}`;
  const template =
    repository === null
      ? ""
      : `template:\n  repository: ${quoteYaml(repository)}\n  branch: ${quoteYaml(request.templateBranch.trim())}\n`;

  return `schema_version: 1
assignment:
  slug: ${quoteYaml(request.assignmentSlug.trim())}
  title: ${quoteYaml(request.assignmentTitle.trim())}
  type: individual
  status: active
${template}sections:
${sections}
${deadline}${metadataBlock}${grading}`;
};

const getGeneratedFile = (
  request: AssignmentSetupRequest
): { file: AssignmentSetupFilePreview; diagnostics: CourseSetupDiagnostic[] } => {
  const termCode = request.termCode.trim();
  const sections = request.sectionIds.map((sectionId) => sectionId.trim());
  const termResult = loadAssignmentSetupTerms(request.courseFolderPath);
  const term = termResult.terms.find((candidate) => candidate.code === termCode);
  const repository = normalizeTemplateRepository(request.templateRepository);
  const diagnostics = [
    ...(request.assignmentTitle.trim().length === 0
      ? [diagnostic("Assignment title is required.")]
      : []),
    ...(request.assignmentSlug.trim().length === 0
      ? [diagnostic("Assignment slug is required.")]
      : []),
    ...(!ASSIGNMENT_SLUG_PATTERN.test(request.assignmentSlug.trim())
      ? [
          diagnostic(
            "Assignment slug may contain only letters, numbers, dots, underscores, and hyphens."
          )
        ]
      : []),
    ...(!TERM_CODE_PATTERN.test(termCode)
      ? [diagnostic("A valid existing term is required.")]
      : []),
    ...(term === undefined ? [diagnostic("Select an existing term from this course.")] : []),
    ...(sections.length === 0 || sections.some((section) => section.length === 0)
      ? [diagnostic("At least one section is required.")]
      : []),
    ...(new Set(sections).size !== sections.length
      ? [diagnostic("Selected sections must be unique.")]
      : []),
    ...(term !== undefined && sections.some((section) => !term.sections.includes(section))
      ? [diagnostic("Selected sections must exist in the selected term.")]
      : []),
    ...((request.templateRepository.trim() !== "" || request.templateBranch.trim() !== "") &&
    repository === null
      ? [diagnostic("Template repository must be owner/repo or a GitHub repository URL.")]
      : []),
    ...(request.dueAt.trim() !== "" && !ISO_DATE_TIME_WITH_OFFSET_PATTERN.test(request.dueAt.trim())
      ? [diagnostic("Due date and time must include a UTC offset.")]
      : []),
    ...(request.points !== null && (!Number.isFinite(request.points) || request.points <= 0)
      ? [diagnostic("Points must be a positive number.")]
      : []),
    ...termResult.diagnostics
  ];
  return {
    file: {
      path: getRelativePath(request),
      content: createAssignmentYaml(request, repository),
      exists: false
    },
    diagnostics
  };
};

export const previewAssignmentSetup = (
  request: AssignmentSetupRequest
): AssignmentSetupPreviewResult => {
  const generated = getGeneratedFile(request);
  const file = {
    ...generated.file,
    exists: fs.existsSync(path.join(request.courseFolderPath, generated.file.path))
  };
  return {
    status: generated.diagnostics.length === 0 ? "ready" : "invalid",
    files: [file],
    diagnostics: generated.diagnostics,
    hasConflicts: file.exists
  };
};

const isContainedPath = (root: string, filePath: string): boolean => {
  const relativePath = path.relative(root, filePath);
  return (
    relativePath.length > 0 && !relativePath.startsWith(`..${path.sep}`) && relativePath !== ".."
  );
};

export const saveAssignmentSetup = (request: AssignmentSetupRequest): AssignmentSetupSaveResult => {
  if (!request.confirmed) {
    return {
      status: "failure",
      writtenFiles: [],
      diagnostics: [diagnostic("Assignment setup must be confirmed before saving.")]
    };
  }
  const preview = previewAssignmentSetup(request);
  if (preview.status === "invalid") {
    return { status: "failure", writtenFiles: [], diagnostics: preview.diagnostics };
  }
  if (preview.hasConflicts && !request.replaceExisting) {
    return {
      status: "failure",
      writtenFiles: [],
      diagnostics: [
        diagnostic("Existing assignment.yml must be explicitly replaced before saving.")
      ]
    };
  }
  const root = path.resolve(request.courseFolderPath);
  const file = preview.files[0];
  if (file === undefined) {
    return {
      status: "failure",
      writtenFiles: [],
      diagnostics: [diagnostic("Assignment file could not be generated.")]
    };
  }
  const absolutePath = path.resolve(root, file.path);
  if (!isContainedPath(root, absolutePath)) {
    return {
      status: "failure",
      writtenFiles: [],
      diagnostics: [diagnostic("Generated path is outside the selected course folder.")]
    };
  }
  try {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, file.content, "utf8");
    return { status: "success", writtenFiles: [file.path], diagnostics: [] };
  } catch {
    return {
      status: "failure",
      writtenFiles: [],
      diagnostics: [diagnostic("Unable to write assignment.yml.")]
    };
  }
};
