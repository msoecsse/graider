/** Sanitized faculty identity only. Credentials never cross IPC. */
export interface GithubFacultyIdentity {
  readonly login: string;
  readonly id: number;
  readonly name: string | null;
}
export interface GithubOAuthState {
  readonly status: "signed_out" | "signed_in" | "unavailable";
  readonly identity: GithubFacultyIdentity | null;
  readonly busy: boolean;
  readonly persistence: "secure" | "memory" | "unknown";
  readonly message: string | null;
}
export const GITHUB_OAUTH_CHANNELS = {
  get: "graider-ui:faculty-auth:get",
  signIn: "graider-ui:faculty-auth:sign-in",
  signOut: "graider-ui:faculty-auth:sign-out",
  switchAccount: "graider-ui:faculty-auth:switch",
  cancel: "graider-ui:faculty-auth:cancel"
} as const;
export interface GithubOAuthApi {
  get(): Promise<GithubOAuthState>;
  signIn(): Promise<GithubOAuthState>;
  signOut(): Promise<GithubOAuthState>;
  switchAccount(): Promise<GithubOAuthState>;
  cancel(): Promise<GithubOAuthState>;
}
