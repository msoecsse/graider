import { z } from "zod";
import { createRelativeGitPath } from "../git/git-workspace.js";

export const REVIEW_SCHEMA_VERSION = 1;
export const MAX_REVIEW_FILES = 100;
const BYTES_PER_KIBIBYTE = 1024;
export const MAX_REVIEW_FILE_BYTES = 4 * BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;
export const MAX_REVIEW_FINDINGS = 1000;
export const MAX_REVIEW_TEXT_LENGTH = 100_000;
export const MAX_REVIEW_ID_LENGTH = 256;
export const MAX_REVIEW_TAGS = 100;
// Full SHA-1 and SHA-256 object IDs, as accepted by Graider's Git workspace.
export const reviewCommitShaSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const identifier = z.string().trim().min(1).max(MAX_REVIEW_ID_LENGTH);
const commentText = z.string().trim().min(1).max(MAX_REVIEW_TEXT_LENGTH);
const repositoryPart = identifier.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
export const reviewProvenanceSchema = z.strictObject({
  source: z.literal("review_import"),
  schemaVersion: z.literal(REVIEW_SCHEMA_VERSION),
  reviewId: identifier,
  findingId: identifier
});
export type ReviewProvenance = z.infer<typeof reviewProvenanceSchema>;
export const reviewFindingKey = (reviewId: string, findingId: string): string =>
  JSON.stringify([reviewId, findingId]);

// The pattern is also exported in JSON Schema; createRelativeGitPath remains the
// shared runtime authority. Require its canonical slash form, never normalize input.
export const reviewSourceSchema = z
  .strictObject({
    file: z
      .string()
      .min(1)
      .max(MAX_REVIEW_TEXT_LENGTH)
      .regex(
        // eslint-disable-next-line no-control-regex -- Reject control characters in the portable JSON Schema too.
        /^(?![A-Za-z]:)(?!.*[\\\u0000-\u001f\u007f])(?!(?:.*\/)?\.{1,2}(?:\/|$))[^/]+(?:\/[^/]+)*$/u,
        "Source path must be normalized, repository-relative, and free of traversal or control characters."
      )
      .refine((file) => createRelativeGitPath(file) === file, "Unsafe source path."),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    // Whole reviewed lines, no extra trailing newline. Preserve whitespace exactly.
    excerpt: z.string().min(1).max(MAX_REVIEW_TEXT_LENGTH)
  })
  .refine((source) => source.endLine >= source.startLine, "Source range must be ordered.")
  .refine(
    (source) =>
      source.excerpt.replaceAll("\r\n", "\n").split("\n").length ===
      source.endLine - source.startLine + 1,
    "Excerpt must contain exactly the recorded source lines."
  );

export const reviewFindingSchema = z
  .strictObject({
    id: identifier,
    title: commentText.optional(),
    text: commentText.optional(),
    deduction: z.number().nonnegative(),
    rubric: z
      .strictObject({ id: identifier.optional(), name: identifier.optional() })
      .refine(
        (reference) => reference.id !== undefined || reference.name !== undefined,
        "A rubric reference requires an ID or name."
      )
      .meta({ anyOf: [{ required: ["id"] }, { required: ["name"] }] })
      .optional(),
    tags: z.array(identifier).max(MAX_REVIEW_TAGS).optional(),
    sourceLocation: reviewSourceSchema.optional()
  })
  .refine(
    (finding) => finding.title !== undefined || finding.text !== undefined,
    "A finding requires a title or comment text."
  )
  .meta({ anyOf: [{ required: ["title"] }, { required: ["text"] }] });

export const reviewSchema = z
  .strictObject({
    schemaVersion: z.literal(REVIEW_SCHEMA_VERSION),
    reviewId: identifier,
    createdAt: z.iso.datetime().optional(),
    generator: z.strictObject({ name: identifier, version: identifier.optional() }).optional(),
    assignment: z.strictObject({
      courseCode: identifier,
      termCode: identifier,
      assignmentSlug: identifier,
      title: identifier.optional()
    }),
    student: z
      .strictObject({
        githubUsername: repositoryPart.optional(),
        // Graider roster student_id is the MSOE username / Java package identity.
        studentId: identifier.optional(),
        displayName: identifier.optional()
      })
      .refine(
        (student) => student.githubUsername !== undefined || student.studentId !== undefined,
        "A GitHub username or MSOE student ID is required."
      )
      .meta({ anyOf: [{ required: ["githubUsername"] }, { required: ["studentId"] }] }),
    repository: z.strictObject({
      owner: repositoryPart,
      name: repositoryPart,
      reviewedCommitSha: reviewCommitShaSchema
    }),
    findings: z.array(reviewFindingSchema).max(MAX_REVIEW_FINDINGS)
  })
  .refine(
    (review) =>
      new Set(review.findings.map((finding) => finding.id)).size === review.findings.length,
    "Finding IDs must be unique within a review."
  );

export type Review = z.infer<typeof reviewSchema>;
export type ReviewFinding = Review["findings"][number];
// Zod refinements (range/context consistency and uniqueness) remain mandatory
// runtime checks. JSON Schema documents these additional semantic constraints.
export const reviewJsonSchema = (): Record<string, unknown> => ({
  ...z.toJSONSchema(reviewSchema, { unrepresentable: "any" }),
  $id: "https://graider.app/schemas/review-v1.schema.json",
  $comment:
    "Also enforce unique finding IDs, title or text, student identity, rubric ID or name, ordered ranges and excerpt line count. See review-import.md."
});
