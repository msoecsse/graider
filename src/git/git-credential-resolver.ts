import type { GitAuthenticationContext } from "./git-workspace.js";

/** Backend-only credential material resolved for one semantic Git operation. */
export interface GitResolvedCredential {
  readonly kind: "github_token";
  readonly host: string;
  readonly token: string;
}

/** Trusted backend boundary; this resolver is never exposed through preload or IPC. */
export interface GitCredentialResolver {
  resolve(context: GitAuthenticationContext): Promise<GitResolvedCredential | null>;
}
