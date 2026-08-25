import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { loadAssignmentSetupTerms, normalizeTemplateRepository } from "./assignmentSetupService.js";
import type {
  AssignmentEditLoadResult,
  AssignmentEditModel,
  AssignmentEditPreviewResult,
  AssignmentEditRequest,
  AssignmentEditSaveResult,
  CourseSetupDiagnostic
} from "./ipc.js";

const ASSIGNMENT_PATH_PATTERN =
  /^terms\/(\d{2}s[123])\/assignments\/([A-Za-z0-9][A-Za-z0-9._-]*)\/assignment\.yml$/;
const ISO_DATE_TIME_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
const VALID_STATUSES = new Set(["draft", "active", "closed", "archived"]);
const DEFAULT_WORKFLOW = ".github/workflows/grade.yml";
const DEFAULT_ARTIFACT = "grading-results";
const DEFAULT_RESULT_FILE = "grading-results.json";

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const quoteYaml = (value: string): string => JSON.stringify(value);
const isContainedPath = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== "..";
};

const getPathParts = (
  assignmentFile: string
): { termCode: string; assignmentSlug: string } | null => {
  const match = assignmentFile.replaceAll("\\", "/").match(ASSIGNMENT_PATH_PATTERN);
  return match === null ? null : { termCode: match[1] ?? "", assignmentSlug: match[2] ?? "" };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const createYaml = (
  model: AssignmentEditModel,
  request: AssignmentEditRequest,
  repository: string
): string => {
  const sections = request.sectionIds
    .map((section) => `  - ${quoteYaml(section.trim())}`)
    .join("\n");
  const grading = request.gradingEnabled
    ? `grading:\n  enabled: true\n  workflow: ${quoteYaml(model.workflow)}\n  artifact: ${quoteYaml(model.artifact)}\n  result_file: ${quoteYaml(model.resultFile)}\n`
    : "grading:\n  enabled: false\n  mode: no-grading\n";
  return `schema_version: 1
assignment:
  slug: ${quoteYaml(model.assignmentSlug)}
  title: ${quoteYaml(request.assignmentTitle.trim())}
  type: individual
  status: ${quoteYaml(request.assignmentStatus)}
template:
  repository: ${quoteYaml(repository)}
  branch: ${quoteYaml(request.templateBranch.trim())}
sections:
${sections}
deadline:
  due_at: ${quoteYaml(request.dueAt.trim())}
  late_policy: ${quoteYaml(request.latePolicy.trim())}
metadata:
  faculty_owner: ${quoteYaml(model.facultyOwner)}
  lms_assignment_id: ${model.lmsAssignmentId === null ? "null" : quoteYaml(model.lmsAssignmentId)}
  grading_category: ${quoteYaml(request.gradingCategory.trim())}
  points: ${String(request.points)}
${grading}`;
};

export const getAssignmentForEdit = (
  courseFolderPath: string,
  assignmentFile: string
): AssignmentEditLoadResult => {
  const parts = getPathParts(assignmentFile);
  const root = path.resolve(courseFolderPath);
  const absolutePath = path.resolve(root, assignmentFile);
  const terms = loadAssignmentSetupTerms(courseFolderPath).terms;
  if (parts === null || !isContainedPath(root, absolutePath))
    return {
      status: "error",
      model: null,
      terms,
      diagnostics: [diagnostic("Assignment path is invalid.")]
    };
  try {
    const originalContent = fs.readFileSync(absolutePath, "utf8");
    const document = parseDocument(originalContent, { strict: true });
    const rootValue = asRecord(document.toJS());
    const assignment = asRecord(rootValue?.assignment);
    const template = asRecord(rootValue?.template);
    const deadline = asRecord(rootValue?.deadline);
    const metadata = asRecord(rootValue?.metadata);
    const grading = asRecord(rootValue?.grading);
    const sections = Array.isArray(rootValue?.sections)
      ? rootValue.sections.filter((item): item is string => typeof item === "string")
      : [];
    const title = asString(assignment?.title);
    const status = asString(assignment?.status);
    const repository = asString(template?.repository);
    const branch = asString(template?.branch);
    const dueAt = asString(deadline?.due_at);
    const latePolicy = asString(deadline?.late_policy);
    const facultyOwner = asString(metadata?.faculty_owner);
    const gradingCategory = asString(metadata?.grading_category);
    const points = metadata?.points;
    if (
      document.errors.length > 0 ||
      title === null ||
      status === null ||
      repository === null ||
      branch === null ||
      dueAt === null ||
      latePolicy === null ||
      facultyOwner === null ||
      gradingCategory === null ||
      typeof points !== "number"
    ) {
      return {
        status: "error",
        model: null,
        terms,
        diagnostics: [diagnostic("Assignment.yml could not be parsed for editing.")]
      };
    }
    return {
      status: "ready",
      terms,
      diagnostics: [],
      model: {
        assignmentFile,
        assignmentSlug: parts.assignmentSlug,
        termCode: parts.termCode,
        assignmentTitle: title,
        assignmentStatus: status,
        sectionIds: sections,
        templateRepository: repository,
        templateBranch: branch,
        dueAt,
        latePolicy,
        gradingEnabled: grading?.enabled !== false,
        points,
        gradingCategory,
        facultyOwner,
        lmsAssignmentId:
          typeof metadata?.lms_assignment_id === "string" ? metadata.lms_assignment_id : null,
        workflow: asString(grading?.workflow) ?? DEFAULT_WORKFLOW,
        artifact: asString(grading?.artifact) ?? DEFAULT_ARTIFACT,
        resultFile: asString(grading?.result_file) ?? DEFAULT_RESULT_FILE,
        originalContent
      }
    };
  } catch {
    return {
      status: "error",
      model: null,
      terms,
      diagnostics: [diagnostic("Unable to load assignment.yml for editing.")]
    };
  }
};

const getPreview = (
  request: AssignmentEditRequest
): { model: AssignmentEditModel | null; preview: AssignmentEditPreviewResult } => {
  const loaded = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile);
  if (loaded.model === null)
    return {
      model: null,
      preview: {
        status: "invalid",
        path: request.assignmentFile,
        content: "",
        diagnostics: loaded.diagnostics
      }
    };
  const model = loaded.model;
  const repository = normalizeTemplateRepository(request.templateRepository);
  const term = loaded.terms.find((candidate) => candidate.code === model.termCode);
  const sections = request.sectionIds.map((section) => section.trim());
  const diagnostics = [
    ...(request.originalContent !== model.originalContent
      ? [diagnostic("The assignment.yml changed after it was loaded. Reload before saving.")]
      : []),
    ...(request.assignmentTitle.trim() === "" ? [diagnostic("Assignment title is required.")] : []),
    ...(repository === null
      ? [diagnostic("Template repository must be owner/repo or a GitHub repository URL.")]
      : []),
    ...(!ISO_DATE_TIME_WITH_OFFSET_PATTERN.test(request.dueAt.trim())
      ? [diagnostic("Due date and time must include a UTC offset.")]
      : []),
    ...(request.latePolicy.trim() === "" ? [diagnostic("Late policy is required.")] : []),
    ...(!VALID_STATUSES.has(request.assignmentStatus)
      ? [diagnostic("Assignment status is invalid.")]
      : []),
    ...(sections.length === 0 || sections.some((section) => section === "")
      ? [diagnostic("At least one section is required.")]
      : []),
    ...(new Set(sections).size !== sections.length
      ? [diagnostic("Selected sections must be unique.")]
      : []),
    ...(term === undefined || sections.some((section) => !term.sections.includes(section))
      ? [diagnostic("Selected sections must exist in the assignment term.")]
      : []),
    ...(!Number.isFinite(request.points) || request.points <= 0
      ? [diagnostic("Points must be a positive number.")]
      : []),
    ...(request.gradingCategory.trim() === "" ? [diagnostic("Grading category is required.")] : [])
  ];
  const changed = request.originalContent !== model.originalContent;
  return {
    model,
    preview: {
      status: changed ? "conflict" : diagnostics.length === 0 ? "ready" : "invalid",
      path: model.assignmentFile,
      content: createYaml(model, request, repository ?? ""),
      diagnostics
    }
  };
};

export const previewAssignmentEdit = (
  request: AssignmentEditRequest
): AssignmentEditPreviewResult => getPreview(request).preview;

export const saveAssignmentEdit = (request: AssignmentEditRequest): AssignmentEditSaveResult => {
  if (!request.confirmed)
    return {
      status: "failure",
      path: request.assignmentFile,
      diagnostics: [diagnostic("Preview the assignment edit before saving.")]
    };
  const { model, preview } = getPreview(request);
  if (preview.status === "conflict")
    return { status: "conflict", path: preview.path, diagnostics: preview.diagnostics };
  if (preview.status !== "ready" || model === null)
    return { status: "failure", path: preview.path, diagnostics: preview.diagnostics };
  const absolutePath = path.resolve(request.courseFolderPath, preview.path);
  if (!isContainedPath(path.resolve(request.courseFolderPath), absolutePath))
    return {
      status: "failure",
      path: preview.path,
      diagnostics: [diagnostic("Assignment path is outside the selected course folder.")]
    };
  try {
    fs.writeFileSync(absolutePath, preview.content, "utf8");
    return { status: "success", path: preview.path, diagnostics: [] };
  } catch {
    return {
      status: "failure",
      path: preview.path,
      diagnostics: [diagnostic("Unable to write assignment.yml.")]
    };
  }
};
