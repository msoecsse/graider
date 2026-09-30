import type {
  GradingCommentLibraryLoadResult,
  GradingCommentLibraryMutationResult
} from "../../electron/ipc";
import type { ReusableComment } from "./GradingCommentLibraryBrowser";

export const commentLibraryLoadFailureMessage = (
  result: GradingCommentLibraryLoadResult
): string => {
  const messages: Readonly<Record<string, string>> = {
    faculty_identity_required:
      "Configure your faculty MSOE username before using the shared comment library.",
    no_assigned_sections:
      "You are not assigned to any sections for this term, so the shared comment library is unavailable.",
    roster_error: "Roster data must be corrected before the shared comment library can be loaded.",
    term_config_error:
      "Term configuration could not be read safely, so the shared comment library is unavailable.",
    failure: "The shared comment library could not be loaded safely."
  };
  return messages[result.status] ?? "The shared comment library could not be loaded safely.";
};

export const commentLibraryMutationFailureMessage = (
  result: GradingCommentLibraryMutationResult
): string => {
  if (result.status === "not_found") return "That reusable comment no longer exists.";
  if (result.status === "failure") return "The reusable comment could not be saved safely.";
  return "The shared comment library is unavailable for this faculty account.";
};

export const commentLibraryPublicationWarning = (
  result: Extract<GradingCommentLibraryMutationResult, { readonly status: "success" }>
): string | undefined =>
  result.publication.status === "failure"
    ? "Comment saved locally, but the shared course repository could not be published. Resolve the repository issue, then use Publish Course Changes to retry."
    : undefined;

export const updateReusableCommentList = (
  comments: readonly ReusableComment[],
  operation: "create" | "edit" | "delete",
  comment: ReusableComment
): readonly ReusableComment[] => {
  if (operation === "create") return [...comments, comment];
  if (operation === "delete") return comments.filter((candidate) => candidate.id !== comment.id);
  return comments.map((candidate) => (candidate.id === comment.id ? comment : candidate));
};
