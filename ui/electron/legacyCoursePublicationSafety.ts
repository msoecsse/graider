import type { GitAuthenticationContextRef, GitWorkspaceWriter } from "./gitWorkspaceReader.js";
import { legacyCourseContentIncompatible } from "./legacyCourseCompatibility.js";

interface PublicationSourceReader extends GitWorkspaceWriter {
  fetchOrigin(request: { readonly authentication: GitAuthenticationContextRef }): Promise<void>;
  resolveRevision(revision: string): Promise<string>;
  readRevisionFile(revision: string, file: string): Promise<string | null>;
}
/** Concrete authenticated-Git check, including legacy retries outside the managed transaction. */
export const verifyLegacyPublicationSource = async (
  workspace: GitWorkspaceWriter,
  authentication: GitAuthenticationContextRef,
  expected?: string
): Promise<string> => {
  const reader = workspace as PublicationSourceReader;
  if (
    ![reader.fetchOrigin, reader.resolveRevision, reader.readRevisionFile].every(
      (method) => typeof method === "function"
    )
  )
    throw new Error("Authoritative course compatibility cannot be verified.");
  await reader.fetchOrigin({ authentication });
  const state = await reader.inspect();
  if (
    state.head.kind !== "attached" ||
    state.upstream.kind !== "configured" ||
    state.upstream.remote !== "origin" ||
    state.upstream.branch !== `origin/${state.head.branch}`
  )
    throw new Error("Current course branch and upstream could not be verified.");
  const revision = await reader.resolveRevision(`refs/remotes/origin/${state.head.branch}`);
  const content = await reader.readRevisionFile(revision, "course.yml");
  if (
    !content ||
    legacyCourseContentIncompatible(content) ||
    (expected !== undefined && expected !== revision)
  )
    throw new Error(
      "The authoritative course schema or revision is unavailable for legacy publication."
    );
  return revision;
};
