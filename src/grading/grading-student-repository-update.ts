import { exactSourceMatches, sourceLines as lines } from "./exact-source-anchor.js";
import { loadGraiderConfig } from "../config/config-loader.js";
import { loadManifest } from "../manifest/manifest-loader.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import {
  findStudentRepositoryMapping,
  normalizeManifestRepositories
} from "../manifest/repository-targets.js";
import type { PullUpstreamRequest, PullUpstreamResult } from "../git/git-workspace.js";
import {
  loadGradingState,
  saveGradingState,
  type GradingState,
  type GradingStatePathRequest
} from "./grading-state.js";

export interface StudentRepositoryUpdateWorkspace {
  revalidate?(): Promise<void>;
  resolveHead(): Promise<string>;
  readRevisionFile(revision: string, file: string): Promise<string | null>;
  pullUpstream(
    request: PullUpstreamRequest & { readonly expectedHead: string }
  ): Promise<PullUpstreamResult>;
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
  const matches = exactSourceMatches(after, snippet.join("\n"));
  const startLine = matches[0];
  if (matches.length !== 1 || startLine === undefined) return stale();
  return {
    ...comment,
    sourceLocation: { ...location, startLine, endLine: startLine + snippet.length - 1 },
    sourceAnchor: { ...original, status: "relocated" }
  };
};

// Resolve identity without the normal submission guard: that guard intentionally
// remains strict for every operation other than this explicit recovery action.
const expectedRepositoryRemote = (request: GradingStatePathRequest): string | null => {
  const manifest = loadManifest(
    createManifestPath(request.courseRoot, request.termCode, request.assignmentSlug).absolutePath,
    { required: true }
  );
  if (
    manifest.status !== "loaded" ||
    manifest.manifest.assignment.termCode !== request.termCode ||
    manifest.manifest.assignment.assignmentSlug !== request.assignmentSlug
  )
    return null;
  const mapping = findStudentRepositoryMapping(
    normalizeManifestRepositories(manifest.manifest),
    request.studentId
  );
  if (mapping === undefined) return null;
  const config = loadGraiderConfig({
    cwd: request.courseRoot,
    assignmentFile: `terms/${request.termCode}/assignments/${request.assignmentSlug}/assignment.yml`
  });
  const owner =
    manifest.manifest.schemaVersion === 1
      ? manifest.manifest.repositories.find((record) => record.studentId === request.studentId)
          ?.repository.owner
      : config.status === "success"
        ? config.config.course.github.organization
        : undefined;
  return owner ? `https://github.com/${owner}/${mapping.repositoryName}.git` : null;
};

const activeUpdates = new Set<string>();
export const updateGradingStudentRepository = async (
  request: GradingStatePathRequest,
  workspace: StudentRepositoryUpdateWorkspace,
  dependencies = { expectedRepositoryRemote }
): Promise<StudentRepositoryUpdateResult> => {
  const key = JSON.stringify(request);
  if (activeUpdates.has(key))
    return {
      status: "repository_update_failed",
      message: "A repository update is already running for this student."
    };
  activeUpdates.add(key);
  let repositoryApplied = false;
  try {
    const loaded = loadGradingState(request);
    if (
      loaded.status !== "missing" &&
      (loaded.status !== "success" || loaded.value.studentId !== request.studentId)
    )
      return { status: "grading_state_error" };
    const previous = loaded.status === "success" ? loaded.value : undefined;
    const head = await workspace.resolveHead();
    const expectedRemote = dependencies.expectedRepositoryRemote(request);
    if (expectedRemote === null)
      return {
        status: "submission_changed",
        message:
          "The student's repository mapping could not be verified. Review the assignment repository mapping."
      };
    await workspace.revalidate?.();
    const pulled = await workspace.pullUpstream({
      expectedHead: previous?.submissionCommitSha ?? head,
      externalFastForward: { expectedRemote }
    });
    if (pulled.kind === "refused") return { status: "submission_changed", message: pulled.message };
    if (pulled.kind === "conflict")
      return {
        status: "merge_conflict",
        message:
          pulled.message ??
          "Git reports merge conflicts. Resolve them manually before continuing. The expected SHA and grading work have been preserved."
      };
    repositoryApplied = true;
    const newSha = await workspace.resolveHead();
    if (previous === undefined) {
      await workspace.revalidate?.();
      if (
        loadGradingState(request).status !== "missing" ||
        (await workspace.resolveHead()) !== newSha
      )
        return {
          status: "update_state_record_failed",
          message:
            "The repository updated while grading state or HEAD changed. Review submission consistency before continuing. Existing grading work was preserved."
        };
      return { status: newSha === head ? "unchanged" : "success" };
    }
    if (newSha === previous.submissionCommitSha) return { status: "unchanged" };
    const appliedComments = await Promise.all(
      previous.appliedComments.map((comment) =>
        relocate(comment, previous.submissionCommitSha, newSha, workspace)
      )
    );
    // Re-read after Git/network work so concurrent grading edits are never overwritten.
    await workspace.revalidate?.();
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
  } catch (error) {
    if (repositoryApplied)
      return {
        status: "update_state_record_failed",
        message:
          "Git completed, but the new submission could not be recorded. Grading work was preserved. Review repository and grading consistency before continuing."
      };
    const kind =
      typeof error === "object" && error !== null && "kind" in error ? String(error.kind) : "";
    const messages: Record<string, string> = {
      authentication_failed: "GitHub authentication failed. Sign in to Graider again, then retry.",
      authorization_changed:
        "Faculty authorization, GitHub session, or repository identity changed. Reopen the assignment and review repository access before retrying.",
      remote_unavailable:
        "The student remote or branch could not be reached. Check your connection and repository access, then retry.",
      repository_unavailable:
        "The local student repository is unavailable. Restore its recorded folder before retrying.",
      operation_rejected:
        "Git refused the update. Check the tracked branch and local repository state before retrying."
    };
    return {
      status: "repository_update_failed",
      message:
        messages[kind] ??
        "Repository update could not finish safely. Check your GitHub session, connection, upstream branch, and local changes. Grading work was preserved."
    };
  } finally {
    activeUpdates.delete(key);
  }
};
