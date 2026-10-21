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
  try {
    const loaded = loadGradingState(request);
    if (loaded.status === "missing") return { status: "grading_state_missing" };
    if (loaded.status !== "success" || loaded.value.studentId !== request.studentId)
      return { status: "grading_state_error" };
    const previous = loaded.value;
    const external = (await workspace.resolveHead()) !== previous.submissionCommitSha;
    const expectedRemote = external ? dependencies.expectedRepositoryRemote(request) : null;
    if (external && expectedRemote === null)
      return {
        status: "submission_changed",
        message:
          "The student's recorded repository identity could not be verified. The expected SHA and grading work were preserved."
      };
    const pulled = await workspace.pullUpstream({
      expectedHead: previous.submissionCommitSha,
      ...(expectedRemote === null ? {} : { externalFastForward: { expectedRemote } })
    });
    if (pulled.kind === "refused") return { status: "submission_changed", message: pulled.message };
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
