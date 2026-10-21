import {
  loadGradingState,
  saveGradingState,
  type GradingState,
  type GradingStatePathRequest
} from "./grading-state.js";

export interface StudentRepositoryUpdateWorkspace {
  resolveHead(): Promise<string>;
  readRevisionFile(revision: string, file: string): Promise<string | null>;
  pullUpstream(request: {
    readonly expectedHead: string;
  }): Promise<{ readonly kind: "updated" | "conflict" }>;
}

export interface StudentRepositoryUpdateResult {
  readonly status:
    | "success"
    | "unchanged"
    | "submission_changed"
    | "grading_state_missing"
    | "grading_state_error"
    | "merge_conflict"
    | "repository_update_failed"
    | "update_state_record_failed";
  readonly message?: string;
}

type Comment = GradingState["appliedComments"][number];
const lines = (text: string): string[] => text.replaceAll("\r\n", "\n").split("\n");

// Exact, unique line sequences are intentionally conservative. Renames, edited text,
// and repeated snippets need instructor review rather than a guessed source link.
const relocate = async (
  comment: Comment,
  previousSha: string,
  newSha: string,
  workspace: StudentRepositoryUpdateWorkspace
): Promise<Comment> => {
  const location = comment.sourceLocation;
  if (location === undefined || comment.sourceAnchor?.status === "stale") return comment;
  const read = async (sha: string): Promise<string | null> => {
    try {
      return await workspace.readRevisionFile(sha, location.file);
    } catch {
      return null;
    }
  };
  const before = await read(previousSha);
  const after = await read(newSha);
  const originalLines = before === null ? [] : lines(before);
  const snippet = originalLines.slice(location.startLine - 1, location.endLine);
  const original = comment.sourceAnchor ?? {
    originalLocation: location,
    originalCommitSha: previousSha,
    ...(snippet.length === 0 ? {} : { originalText: snippet.join("\n") })
  };
  const stale = (): Comment => ({ ...comment, sourceAnchor: { ...original, status: "stale" } });
  if (before === null || after === null || location.endLine > originalLines.length) return stale();
  if (before === after) return comment;
  if (snippet.every((line) => line.trim() === "")) return stale();
  const updatedLines = lines(after);
  const matches: number[] = [];
  for (let index = 0; index <= updatedLines.length - snippet.length; index++) {
    if (snippet.every((line, offset) => updatedLines[index + offset] === line))
      matches.push(index + 1);
  }
  const startLine = matches[0];
  if (matches.length !== 1 || startLine === undefined) return stale();
  return {
    ...comment,
    sourceLocation: { ...location, startLine, endLine: startLine + snippet.length - 1 },
    sourceAnchor: { ...original, status: "relocated" }
  };
};

const activeUpdates = new Set<string>();
export const updateGradingStudentRepository = async (
  request: GradingStatePathRequest,
  workspace: StudentRepositoryUpdateWorkspace
): Promise<StudentRepositoryUpdateResult> => {
  const key = JSON.stringify(request);
  if (activeUpdates.has(key))
    return {
      status: "repository_update_failed",
      message: "A repository update is already running for this student."
    };
  activeUpdates.add(key);
  try {
    const loaded = loadGradingState(request);
    if (loaded.status === "missing") return { status: "grading_state_missing" };
    if (loaded.status !== "success" || loaded.value.studentId !== request.studentId)
      return { status: "grading_state_error" };
    const previous = loaded.value;
    if ((await workspace.resolveHead()) !== previous.submissionCommitSha)
      return { status: "submission_changed" };
    const pulled = await workspace.pullUpstream({ expectedHead: previous.submissionCommitSha });
    if (pulled.kind === "conflict")
      return {
        status: "merge_conflict",
        message:
          "Git reports merge conflicts. Resolve them manually before continuing. The expected SHA and grading work have been preserved."
      };
    const newSha = await workspace.resolveHead();
    if (newSha === previous.submissionCommitSha) return { status: "unchanged" };
    const appliedComments = await Promise.all(
      previous.appliedComments.map((comment) =>
        relocate(comment, previous.submissionCommitSha, newSha, workspace)
      )
    );
    // Re-read after Git/network work so concurrent grading edits are never overwritten.
    const finalHead = await workspace.resolveHead();
    const current = loadGradingState(request);
    if (
      current.status !== "success" ||
      JSON.stringify(current.value) !== JSON.stringify(previous) ||
      finalHead !== newSha
    )
      return {
        status: "update_state_record_failed",
        message:
          "The repository updated, but grading state changed concurrently. Grading work was preserved; the SHA consistency guard remains active."
      };
    const saved = saveGradingState(request, {
      ...previous,
      submissionCommitSha: newSha,
      updatedSinceGrading:
        previous.updatedSinceGrading === true || previous.status !== "not_started",
      repositoryUpdates: [
        ...(previous.repositoryUpdates ?? []),
        { previousSha: previous.submissionCommitSha, newSha, updatedAt: new Date().toISOString() }
      ],
      appliedComments
    });
    return saved.status === "success"
      ? { status: "success" }
      : {
          status: "update_state_record_failed",
          message:
            "The repository updated, but its new SHA could not be saved. Grading work was preserved; the SHA consistency guard remains active."
        };
  } catch {
    return {
      status: "repository_update_failed",
      message:
        "Unable to pull latest changes. Check Git authentication, the upstream branch, and local changes. No grading state was changed."
    };
  } finally {
    activeUpdates.delete(key);
  }
};
