import path from "node:path";
import {
  MAX_REVIEW_FILE_BYTES,
  REVIEW_SCHEMA_VERSION,
  reviewSchema,
  type Review
} from "./review-schema.js";

export interface ReviewInput {
  readonly filename: string;
  readonly content: string;
}
export interface ReviewDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}
export type ParsedReview =
  | { readonly status: "valid"; readonly review: Review }
  | { readonly status: "invalid"; readonly diagnostics: readonly ReviewDiagnostic[] };
export const diagnostic = (code: string, message: string): ReviewDiagnostic => ({ code, message });
export const reviewFilename = (filename: string): string =>
  path.win32.basename(path.posix.basename(filename));
const invalid = (code: string, message: string): ParsedReview => ({
  status: "invalid",
  diagnostics: [diagnostic(code, message)]
});

export const parseReviewInput = (input: ReviewInput): ParsedReview => {
  if (path.extname(input.filename).toLowerCase() !== ".json")
    return invalid("json_required", "Select a JSON review file.");
  if (Buffer.byteLength(input.content, "utf8") > MAX_REVIEW_FILE_BYTES)
    return invalid("file_too_large", "Review exceeds the file size limit.");
  let value: unknown;
  try {
    value = JSON.parse(input.content) as unknown;
  } catch {
    return invalid("malformed_json", "Review JSON is malformed.");
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion !== REVIEW_SCHEMA_VERSION
  )
    return invalid(
      "unsupported_schema_version",
      `Unsupported review schema version: ${typeof value.schemaVersion === "number" ? String(value.schemaVersion) : "invalid value"}.`
    );
  const parsed = reviewSchema.safeParse(value);
  return parsed.success
    ? { status: "valid", review: parsed.data }
    : {
        status: "invalid",
        // Never echo input values (including potentially sensitive absolute paths).
        diagnostics: parsed.error.issues.map((issue) => ({
          code: "invalid_schema",
          field: issue.path.join("."),
          message: issue.message
        }))
      };
};
