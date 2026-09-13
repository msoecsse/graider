import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const GRADING_STATE_SCHEMA_VERSION = 1;

export interface GradingEditorCursor {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface GradingEditorSelection {
  readonly file: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface GradingEditorViewState {
  readonly scrollTop: number;
  readonly cursor: GradingEditorCursor;
  readonly selection?: GradingEditorSelection;
}

const gradingStatusSchema = z.enum(["not_started", "in_progress", "complete", "published"]);
const relativeSourceFileSchema = z
  .string()
  .trim()
  .min(1)
  .refine((file) => !path.isAbsolute(file) && !path.win32.isAbsolute(file), {
    message: "Source file must be a relative path."
  });
const editorCursorSchema = z
  .object({
    file: relativeSourceFileSchema,
    line: z.number().int().positive(),
    column: z.number().int().positive()
  })
  .strict();
const editorSelectionSchema = z
  .object({
    file: relativeSourceFileSchema,
    startLine: z.number().int().positive(),
    startColumn: z.number().int().positive(),
    endLine: z.number().int().positive(),
    endColumn: z.number().int().positive()
  })
  .strict()
  .refine(
    (selection) =>
      selection.startLine < selection.endLine ||
      (selection.startLine === selection.endLine && selection.startColumn <= selection.endColumn),
    { message: "Editor selection must be ordered from start to end." }
  );
const gradingEditorViewStateSchema = z
  .object({
    scrollTop: z.number().nonnegative(),
    cursor: editorCursorSchema,
    selection: editorSelectionSchema.optional()
  })
  .strict();
const sourceLocationSchema = z
  .object({
    file: relativeSourceFileSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive()
  })
  .strict()
  .refine((location) => location.endLine >= location.startLine);
const appliedCommentSchema = z
  .object({
    id: z.string().trim().min(1),
    sourceCommentId: z.string().trim().min(1).optional(),
    text: z.string(),
    deduction: z.number(),
    rubricCategoryId: z.string().trim().min(1).optional(),
    sourceLocation: sourceLocationSchema.optional()
  })
  .strict();
const manualAdjustmentSchema = z
  .object({
    id: z.string().trim().min(1),
    rubricCategoryId: z.string().trim().min(1),
    amount: z.number(),
    note: z.string().optional()
  })
  .strict();

export const gradingStateSchema = z
  .object({
    schemaVersion: z.literal(GRADING_STATE_SCHEMA_VERSION),
    studentId: z.string().trim().min(1),
    submissionCommitSha: z.string().trim().min(1),
    status: gradingStatusSchema,
    appliedComments: z.array(appliedCommentSchema),
    manualAdjustments: z.array(manualAdjustmentSchema),
    viewState: gradingEditorViewStateSchema.optional()
  })
  .strict()
  .superRefine((state, context) => {
    if (
      new Set(state.appliedComments.map((comment) => comment.id)).size !==
      state.appliedComments.length
    )
      context.addIssue({ code: "custom", message: "Applied comment IDs must be unique." });
    if (
      new Set(state.manualAdjustments.map((adjustment) => adjustment.id)).size !==
      state.manualAdjustments.length
    )
      context.addIssue({ code: "custom", message: "Manual adjustment IDs must be unique." });
  });

type ParsedGradingState = z.output<typeof gradingStateSchema>;
export type GradingState = Omit<ParsedGradingState, "viewState"> & {
  readonly viewState?: GradingEditorViewState;
};
type ParsedGradingEditorViewState = z.output<typeof gradingEditorViewStateSchema>;

export const canonicalizeGradingEditorViewState = (
  viewState: ParsedGradingEditorViewState
): GradingEditorViewState => ({
  scrollTop: viewState.scrollTop,
  cursor: viewState.cursor,
  ...(viewState.selection === undefined ? {} : { selection: viewState.selection })
});

const canonicalizeGradingState = (state: ParsedGradingState): GradingState => {
  const { viewState, ...stateWithoutViewState } = state;
  return {
    ...stateWithoutViewState,
    ...(viewState === undefined ? {} : { viewState: canonicalizeGradingEditorViewState(viewState) })
  };
};

export type GradingStateResult<T> =
  | { readonly status: "success"; readonly value: T }
  | { readonly status: "failure"; readonly code: string; readonly message: string };

export type LoadGradingStateResult =
  | { readonly status: "missing" }
  | GradingStateResult<GradingState>;

export interface GradingStatePathRequest {
  readonly courseRoot: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}

const isPathSegment = (value: string): boolean =>
  value.trim() !== "" && !value.includes("/") && !value.includes("\\");

export const createGradingStatePath = (
  request: GradingStatePathRequest
): GradingStateResult<string> => {
  if (![request.termCode, request.assignmentSlug, request.studentId].every(isPathSegment))
    return {
      status: "failure",
      code: "invalid_grading_state_path",
      message: "Invalid grading state path segment."
    };
  return {
    status: "success",
    value: path.join(
      request.courseRoot,
      ".graider",
      "grading",
      request.termCode,
      request.assignmentSlug,
      "state",
      `${request.studentId}.json`
    )
  };
};

export const createInitialGradingState = (
  studentId: string,
  submissionCommitSha: string
): GradingStateResult<GradingState> => {
  const result = gradingStateSchema.safeParse({
    schemaVersion: GRADING_STATE_SCHEMA_VERSION,
    studentId: studentId.trim(),
    submissionCommitSha: submissionCommitSha.trim(),
    status: "not_started",
    appliedComments: [],
    manualAdjustments: []
  });
  return result.success
    ? { status: "success", value: canonicalizeGradingState(result.data) }
    : {
        status: "failure",
        code: "invalid_grading_state",
        message: result.error.issues[0]?.message ?? "Invalid grading state."
      };
};

export const validateGradingState = (value: unknown): GradingStateResult<GradingState> => {
  const result = gradingStateSchema.safeParse(value);
  return result.success
    ? { status: "success", value: canonicalizeGradingState(result.data) }
    : {
        status: "failure",
        code: "invalid_grading_state",
        message: result.error.issues[0]?.message ?? "Invalid grading state."
      };
};

export const loadGradingState = (request: GradingStatePathRequest): LoadGradingStateResult => {
  const statePath = createGradingStatePath(request);
  if (statePath.status === "failure")
    return { status: "failure", code: statePath.code, message: statePath.message };
  let content: string;
  try {
    content = fs.readFileSync(statePath.value, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    return {
      status: "failure",
      code: "grading_state_read_failed",
      message: "Unable to read grading state."
    };
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "schemaVersion" in parsed &&
      (parsed as { schemaVersion?: unknown }).schemaVersion !== GRADING_STATE_SCHEMA_VERSION
    )
      return {
        status: "failure",
        code: "unsupported_grading_state_schema_version",
        message: "Unsupported grading state schema version."
      };
    return validateGradingState(parsed);
  } catch {
    return {
      status: "failure",
      code: "invalid_grading_state_json",
      message: "Grading state JSON is malformed."
    };
  }
};

export const saveGradingState = (
  request: GradingStatePathRequest,
  state: GradingState
): GradingStateResult<undefined> => {
  const statePath = createGradingStatePath(request);
  if (statePath.status === "failure")
    return { status: "failure", code: statePath.code, message: statePath.message };
  const validated = validateGradingState(state);
  if (validated.status === "failure")
    return { status: "failure", code: validated.code, message: validated.message };
  if (validated.value.studentId !== request.studentId)
    return {
      status: "failure",
      code: "grading_state_student_mismatch",
      message: "State student ID does not match its path."
    };
  try {
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    const temporaryPath = `${statePath.value}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(validated.value, undefined, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, statePath.value);
    return { status: "success", value: undefined };
  } catch {
    return {
      status: "failure",
      code: "grading_state_write_failed",
      message: "Unable to save grading state."
    };
  }
};
