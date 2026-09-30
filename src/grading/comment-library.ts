import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const COMMENT_LIBRARY_SCHEMA_VERSION = 1;
const MAX_REUSABLE_COMMENT_ID_GENERATION_ATTEMPTS = 10;

const tagsSchema = z.array(z.string()).transform((tags) => {
  const seen = new Set<string>();
  return tags.reduce<string[]>((normalized, tag) => {
    const displayValue = tag.trim();
    const key = displayValue.toLocaleLowerCase();
    if (displayValue !== "" && !seen.has(key)) {
      seen.add(key);
      normalized.push(displayValue);
    }
    return normalized;
  }, []);
});

export const reusableCommentSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    text: z.string().min(1),
    defaultDeduction: z.number(),
    defaultRubricCategoryId: z.string().trim().min(1).optional(),
    tags: tagsSchema
  })
  .strict();

export const commentLibrarySchema = z
  .object({
    schemaVersion: z.literal(COMMENT_LIBRARY_SCHEMA_VERSION),
    comments: z.array(reusableCommentSchema)
  })
  .strict()
  .superRefine((library, context) => {
    if (new Set(library.comments.map((comment) => comment.id)).size !== library.comments.length)
      context.addIssue({ code: "custom", message: "Comment IDs must be unique." });
  });

export type ReusableComment = z.infer<typeof reusableCommentSchema>;
export type ReusableCommentUpdate = Omit<ReusableComment, "id">;
export type ReusableCommentFields = ReusableCommentUpdate;
export type CommentLibrary = z.infer<typeof commentLibrarySchema>;
export type CommentLibraryResult<T> =
  | { readonly status: "success"; readonly value: T }
  | { readonly status: "failure"; readonly code: string; readonly message: string };
export type CommentLibraryOperationResult<T> =
  | CommentLibraryResult<T>
  | { readonly status: "not_found"; readonly code: string; readonly message: string };

export interface CommentSearchOptions {
  readonly query?: string;
  readonly tags?: readonly string[];
}

const emptyLibrary = (): CommentLibrary => ({
  schemaVersion: COMMENT_LIBRARY_SCHEMA_VERSION,
  comments: []
});

export const createCommentLibraryPath = (courseRoot: string): string =>
  path.join(courseRoot, ".graider", "grading", "comments.json");

const validateLibrary = (value: unknown): CommentLibraryResult<CommentLibrary> => {
  const result = commentLibrarySchema.safeParse(value);
  return result.success
    ? { status: "success", value: result.data }
    : {
        status: "failure",
        code: "invalid_comment_library",
        message: result.error.issues[0]?.message ?? "Invalid comment library."
      };
};

const validateComment = (value: unknown): CommentLibraryResult<ReusableComment> => {
  const result = reusableCommentSchema.safeParse(value);
  return result.success
    ? { status: "success", value: result.data }
    : {
        status: "failure",
        code: "invalid_reusable_comment",
        message: result.error.issues[0]?.message ?? "Invalid reusable comment."
      };
};

export const loadCommentLibrary = (courseRoot: string): CommentLibraryResult<CommentLibrary> => {
  const libraryPath = createCommentLibraryPath(courseRoot);
  let content: string;
  try {
    content = fs.readFileSync(libraryPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { status: "success", value: emptyLibrary() };
    return {
      status: "failure",
      code: "comment_library_read_failed",
      message: "Unable to read comment library."
    };
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "schemaVersion" in parsed &&
      (parsed as { schemaVersion?: unknown }).schemaVersion !== COMMENT_LIBRARY_SCHEMA_VERSION
    )
      return {
        status: "failure",
        code: "unsupported_comment_library_schema_version",
        message: "Unsupported comment library schema version."
      };
    return validateLibrary(parsed);
  } catch {
    return {
      status: "failure",
      code: "invalid_comment_library_json",
      message: "Comment library JSON is malformed."
    };
  }
};

export const listReusableComments = (
  courseRoot: string
): CommentLibraryResult<ReusableComment[]> => {
  const library = loadCommentLibrary(courseRoot);
  return library.status === "success"
    ? { status: "success", value: library.value.comments }
    : library;
};

export const getReusableComment = (
  courseRoot: string,
  id: string
): CommentLibraryOperationResult<ReusableComment> => {
  const library = loadCommentLibrary(courseRoot);
  if (library.status === "failure") return library;
  const comment = library.value.comments.find((entry) => entry.id === id.trim());
  return comment === undefined
    ? {
        status: "not_found",
        code: "comment_not_found",
        message: "Reusable comment was not found."
      }
    : { status: "success", value: comment };
};

const writeCommentLibrary = (
  courseRoot: string,
  library: CommentLibrary
): CommentLibraryResult<undefined> => {
  const validated = validateLibrary(library);
  if (validated.status === "failure") return validated;
  const libraryPath = createCommentLibraryPath(courseRoot);
  try {
    fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
    const temporaryPath = `${libraryPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(validated.value, undefined, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, libraryPath);
    return { status: "success", value: undefined };
  } catch {
    return {
      status: "failure",
      code: "comment_library_write_failed",
      message: "Unable to save comment library."
    };
  }
};

const loadForMutation = (courseRoot: string): CommentLibraryResult<CommentLibrary> =>
  loadCommentLibrary(courseRoot);

export const createReusableComment = (
  courseRoot: string,
  comment: ReusableComment
): CommentLibraryResult<ReusableComment> => {
  const normalized = validateComment(comment);
  if (normalized.status === "failure") return normalized;
  const library = loadForMutation(courseRoot);
  if (library.status === "failure") return library;
  if (library.value.comments.some(({ id }) => id === normalized.value.id))
    return {
      status: "failure",
      code: "duplicate_comment_id",
      message: "A reusable comment already has that ID."
    };
  const saved = writeCommentLibrary(courseRoot, {
    ...library.value,
    comments: [...library.value.comments, normalized.value]
  });
  return saved.status === "success" ? { status: "success", value: normalized.value } : saved;
};

export const createReusableCommentWithGeneratedId = (
  courseRoot: string,
  fields: ReusableCommentFields,
  generateId: () => string = randomUUID
): CommentLibraryResult<ReusableComment> => {
  for (let attempt = 0; attempt < MAX_REUSABLE_COMMENT_ID_GENERATION_ATTEMPTS; attempt += 1) {
    const created = createReusableComment(courseRoot, { ...fields, id: generateId() });
    if (created.status !== "failure" || created.code !== "duplicate_comment_id") return created;
  }
  return {
    status: "failure",
    code: "comment_id_generation_failed",
    message: "Unable to generate a unique reusable comment ID."
  };
};

export const editReusableComment = (
  courseRoot: string,
  id: string,
  update: ReusableCommentUpdate
): CommentLibraryOperationResult<ReusableComment> => {
  const library = loadForMutation(courseRoot);
  if (library.status === "failure") return library;
  const commentId = id.trim();
  const existing = library.value.comments.find((comment) => comment.id === commentId);
  if (existing === undefined)
    return {
      status: "not_found",
      code: "comment_not_found",
      message: "Reusable comment was not found."
    };
  const normalized = validateComment({ ...update, id: existing.id });
  if (normalized.status === "failure") return normalized;
  const saved = writeCommentLibrary(courseRoot, {
    ...library.value,
    comments: library.value.comments.map((comment) =>
      comment.id === commentId ? normalized.value : comment
    )
  });
  return saved.status === "success" ? { status: "success", value: normalized.value } : saved;
};

export const deleteReusableComment = (
  courseRoot: string,
  id: string
): CommentLibraryOperationResult<undefined> => {
  const library = loadForMutation(courseRoot);
  if (library.status === "failure") return library;
  const commentId = id.trim();
  if (!library.value.comments.some((comment) => comment.id === commentId))
    return {
      status: "not_found",
      code: "comment_not_found",
      message: "Reusable comment was not found."
    };
  return writeCommentLibrary(courseRoot, {
    ...library.value,
    comments: library.value.comments.filter((comment) => comment.id !== commentId)
  });
};

export const searchReusableComments = (
  comments: readonly ReusableComment[],
  options: CommentSearchOptions = {}
): ReusableComment[] => {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const selectedTags = [
    ...new Set(
      (options.tags ?? []).map((tag) => tag.trim().toLocaleLowerCase()).filter((tag) => tag !== "")
    )
  ];
  return comments.filter((comment) => {
    const tags = comment.tags.map((tag) => tag.toLocaleLowerCase());
    const matchesQuery =
      query === "" ||
      comment.title.toLocaleLowerCase().includes(query) ||
      comment.text.toLocaleLowerCase().includes(query) ||
      tags.some((tag) => tag.includes(query));
    return matchesQuery && selectedTags.every((tag) => tags.includes(tag));
  });
};
