export type OrganizationAccessStatus =
  | "accessible"
  | "pending"
  | "oauth_approval_required"
  | "sso_required"
  | "authorization_required"
  | "insufficient_scope"
  | "forbidden"
  | "network_unavailable"
  | "rate_limited"
  | "error";
export interface GithubOrganization {
  readonly organizationId: number;
  readonly login: string;
  readonly membershipState: "active" | "pending";
  readonly membershipRole: "admin" | "member";
  readonly directMembership: boolean | null;
  readonly accessStatus: OrganizationAccessStatus;
  readonly accessDiagnostic: string;
}
export interface OrganizationDiscovery {
  readonly status: "idle" | "loading" | "authorization_required" | "ready" | "error";
  readonly organizations: readonly GithubOrganization[];
  readonly message: string | null;
  readonly stale: boolean;
}
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
  readonly organizationPermission: "available" | "required" | "unknown";
  readonly organizationDiscovery: OrganizationDiscovery;
  readonly persistence: "secure" | "memory" | "unknown";
  readonly message: string | null;
}
export const GITHUB_OAUTH_CHANNELS = {
  get: "graider-ui:faculty-auth:get",
  signIn: "graider-ui:faculty-auth:sign-in",
  signOut: "graider-ui:faculty-auth:sign-out",
  switchAccount: "graider-ui:faculty-auth:switch",
  cancel: "graider-ui:faculty-auth:cancel",
  refreshOrganizations: "graider-ui:faculty-auth:organizations",
  manageAuthorization: "graider-ui:faculty-auth:manage-authorization"
} as const;
export interface GithubOAuthApi {
  refreshOrganizations(): Promise<GithubOAuthState>;
  manageAuthorization(): Promise<GithubOAuthState>;
  get(): Promise<GithubOAuthState>;
  signIn(): Promise<GithubOAuthState>;
  signOut(): Promise<GithubOAuthState>;
  switchAccount(): Promise<GithubOAuthState>;
  cancel(): Promise<GithubOAuthState>;
}
