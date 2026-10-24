import type { RubricCategory } from "../grading/grading-state-operations.js";
import type { GradingState } from "../grading/grading-state.js";
import type { RosterStudent } from "../roster/roster-models.js";
import type { Review, ReviewFinding, ReviewProvenance } from "./review-schema.js";
import type { ReviewDiagnostic } from "./review-input.js";

export type ImportStatus = "ready" | "warning" | "duplicate" | "unmatched" | "invalid";
export type ShaState = "exact" | "changed" | "unavailable" | "unrelated";
export interface ReviewSubmission {
  readonly student: Pick<RosterStudent, "studentId" | "githubUsername">;
  readonly repository: { readonly owner: string; readonly name: string } | null;
  readonly currentCommitSha: string | null;
  readonly gradingState: GradingState | null;
  readonly diagnostics: readonly ReviewDiagnostic[];
}
/** Trusted, faculty-scoped context. Never construct this from review metadata. */
export interface ReviewImportContext {
  readonly assignment: Review["assignment"];
  readonly rubric: readonly RubricCategory[];
  readonly submissions: readonly ReviewSubmission[];
  /** Read-only repository access, selected exclusively by canonical student ID. */
  readonly repository: (studentId: string) => Promise<ReviewRepositoryReader | null>;
}
export interface ReviewRepositoryReader {
  /** Must validate actual remote identity against the trusted manifest mapping. */
  matchesRepository(owner: string, name: string): Promise<boolean>;
  /** Proves membership in current canonical commit history; false = unrelated,
   * null = history unavailable. No fetching, pulls or checkout permitted. */
  isInHistory(reviewedSha: string, currentSha: string): Promise<boolean | null>;
  readRevisionFile(sha: string, file: string): Promise<string | null>;
}
export interface RubricMapping {
  readonly status: "exact" | "fallback" | "general" | "unresolved";
  readonly categoryId?: string;
  readonly diagnostics: readonly ReviewDiagnostic[];
}
export interface AnchorPlan {
  readonly status: "general" | "ready" | "recoverable" | "unresolved";
  readonly original?: NonNullable<ReviewFinding["sourceLocation"]>;
  readonly proposed?: {
    readonly file: string;
    readonly startLine: number;
    readonly endLine: number;
  };
  readonly diagnostics: readonly ReviewDiagnostic[];
}
export interface FindingPlan {
  readonly finding: ReviewFinding;
  readonly provenance: ReviewProvenance;
  readonly key: string;
  readonly status: ImportStatus;
  readonly duplicate: boolean;
  readonly rubric: RubricMapping;
  readonly anchor: AnchorPlan;
  readonly diagnostics: readonly ReviewDiagnostic[];
  readonly eligibleToApply: boolean;
  readonly requiresApproval: boolean;
  readonly recoveryRequired: boolean;
  /** Describes only an addition; this is not an applied comment or mutation. */
  readonly operation: "add_comment" | null;
}
export type ImportCounts = Readonly<Record<ImportStatus, number>>;
export interface ReviewPlan {
  readonly filename: string;
  readonly status: ImportStatus;
  readonly review?: Review;
  readonly matchedStudent?: ReviewSubmission["student"];
  readonly currentCommitSha?: string;
  readonly shaState?: ShaState;
  readonly diagnostics: readonly ReviewDiagnostic[];
  readonly findings: readonly FindingPlan[];
  readonly findingCounts: ImportCounts;
}
export interface ReviewImportPlan {
  readonly schemaVersion: 1;
  readonly reviews: readonly ReviewPlan[];
  readonly summary: ImportCounts & {
    readonly totalFiles: number;
    readonly eligibleFindings: number;
    readonly findingCounts: ImportCounts;
  };
  readonly diagnostics: readonly ReviewDiagnostic[];
}
export const importCounts = (
  items: readonly { readonly status: ImportStatus }[]
): ImportCounts => ({
  ready: items.filter((item) => item.status === "ready").length,
  warning: items.filter((item) => item.status === "warning").length,
  duplicate: items.filter((item) => item.status === "duplicate").length,
  unmatched: items.filter((item) => item.status === "unmatched").length,
  invalid: items.filter((item) => item.status === "invalid").length
});
