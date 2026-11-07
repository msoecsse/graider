import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAuthenticatedDugiteGitWorkspace } from "../git/dugite-git-workspace-context.js";
import {
  migrationCheckpointReference,
  type GitRemoteCheckpointRequest,
  type GitRemoteCheckpointWorkspace,
  type TrustedGitRemote
} from "../git/git-workspace.js";

export type MigrationCheckpointResult =
  | {
      readonly status: "verified";
      readonly reference: string;
      readonly commit: string;
      readonly publicationReady: false;
    }
  | {
      readonly status: "needs_attention";
      readonly reason: "validation_failed" | "checkpoint_conflict" | "checkpoint_unverified";
      readonly publicationReady: false;
    };

/** Caller owns current repository/account/authorization/source validation, including after awaits.
 * Remote observation alone proves a checkpoint; push responses and local tags never do.
 */
export const verifyMigrationCheckpoint = async (
  workspace: GitRemoteCheckpointWorkspace,
  request: GitRemoteCheckpointRequest,
  revalidate: () => Promise<void>,
  options: { readonly create: boolean } = { create: true }
): Promise<MigrationCheckpointResult> => {
  const attention = (
    reason: Extract<MigrationCheckpointResult, { status: "needs_attention" }>["reason"]
  ): MigrationCheckpointResult =>
    Object.freeze({ status: "needs_attention", reason, publicationReady: false });
  const validate = async (): Promise<boolean> => {
    try {
      await revalidate();
      return true;
    } catch {
      return false;
    }
  };
  if (!(await validate())) return attention("validation_failed");
  let observed: string | null;
  try {
    observed = await workspace.readRemoteCheckpoint(request);
  } catch {
    return attention("checkpoint_unverified");
  }
  if (!(await validate())) return attention("validation_failed");
  if (observed === null && options.create) {
    try {
      await workspace.createRemoteCheckpoint(request);
    } catch {
      /* A lost/rejected response is resolved only by an independent read below. */
    }
    if (!(await validate())) return attention("validation_failed");
    try {
      observed = await workspace.readRemoteCheckpoint(request);
    } catch {
      return attention("checkpoint_unverified");
    }
    if (!(await validate())) return attention("validation_failed");
  }
  if (observed === null) return attention("checkpoint_unverified");
  if (observed !== request.sourceCommit) return attention("checkpoint_conflict");
  return Object.freeze({
    status: "verified",
    reference: migrationCheckpointReference(request.sourceCommit),
    commit: request.sourceCommit,
    publicationReady: false
  });
};

const CLEANUP_RETRIES = 5;
const CLEANUP_DELAY_MS = 100;
/** Main-only isolated attempt. Never opens, fetches, tags or modifies the active managed cache. */
export const withMigrationCheckpointWorkspace = async <T>(
  remote: TrustedGitRemote,
  token: string,
  operation: (
    workspace: GitRemoteCheckpointWorkspace,
    authentication: GitRemoteCheckpointRequest["authentication"]
  ) => Promise<T>
): Promise<T> => {
  const { factory, authentication } = createAuthenticatedDugiteGitWorkspace(token);
  const temporary = await mkdtemp(path.join(tmpdir(), "graider-migration-checkpoint-"));
  try {
    const workspace = await factory.clone({
      remote,
      destination: path.join(temporary, "repo"),
      checkout: "none",
      authentication
    });
    return await operation(await factory.openCheckpoint(workspace.root), authentication);
  } finally {
    await rm(temporary, {
      recursive: true,
      force: true,
      maxRetries: CLEANUP_RETRIES,
      retryDelay: CLEANUP_DELAY_MS
    });
  }
};
