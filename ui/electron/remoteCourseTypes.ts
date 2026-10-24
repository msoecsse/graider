/** Sanitized discovery data only; repository IDs are canonical, names are mutable locators. */
export type CourseAuthorization =
  | "authorized"
  | "faculty_identity_required"
  | "not_authorized"
  | "unavailable";
export type CourseLocalStatus =
  | "registered_local"
  | "remote_only"
  | "local_origin_mismatch"
  | "local_unverified";
export interface RemoteCourse {
  readonly bootstrap?: ManagedCourseState;
  readonly repositoryId: number;
  readonly nodeId: string | null;
  readonly organizationId: number;
  readonly organizationLogin: string;
  readonly name: string;
  readonly fullName: string;
  readonly url: string;
  readonly defaultBranch: string;
  readonly visibility: "private" | "public" | "internal";
  readonly archived: boolean;
  readonly code: string;
  readonly title: string;
  readonly schemaVersion: number;
  readonly discoveryHints: readonly string[];
  readonly authorization: CourseAuthorization;
  readonly localStatus: CourseLocalStatus;
  readonly localFolderIds: readonly string[];
  readonly diagnostics: readonly string[];
}
export type CourseDiscoveryProblem =
  | "invalid_credential"
  | "insufficient_scope"
  | "oauth_approval_required"
  | "sso_required"
  | "repository_inaccessible"
  | "rate_limited"
  | "network_unavailable"
  | "error"
  | "unavailable"
  | "migration_required"
  | "search_incomplete"
  | "missing_metadata"
  | "unsupported_schema"
  | "invalid_metadata"
  | "ambiguous";
export interface CourseDiscoveryDiagnostic {
  readonly organizationId: number | null;
  readonly repositoryId?: number;
  readonly status: CourseDiscoveryProblem;
  readonly message: string;
}
export interface RemoteCourseDiscovery {
  readonly status:
    | "idle"
    | "loading"
    | "authorization_required"
    | "ready"
    | "partial_failure"
    | "error";
  readonly userId: number | null;
  readonly discoveredAt: string | null;
  readonly courses: readonly RemoteCourse[];
  readonly diagnostics: readonly CourseDiscoveryDiagnostic[];
}
export const emptyCourseDiscovery = (): RemoteCourseDiscovery => ({
  status: "idle",
  userId: null,
  discoveredAt: null,
  courses: [],
  diagnostics: []
});

/** Public state contains neither credentials nor machine-local paths. */
export interface ManagedCourseState {
  readonly status:
    | "not_bootstrapped"
    | "queued"
    | "bootstrapping"
    | "ready"
    | "failed"
    | "needs_attention";
  readonly diagnostic: string | null;
  readonly retryable: boolean;
}
export interface ManagedCourseInspection {
  readonly repositoryId: number;
  readonly code: string;
  readonly title: string;
  readonly terms: readonly string[];
  readonly assignments: readonly {
    readonly term: string;
    readonly slug: string;
    readonly title: string;
    readonly status: string;
  }[];
}
