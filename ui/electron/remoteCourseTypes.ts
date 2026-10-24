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
  readonly synchronization?: ManagedSynchronizationState;
  readonly reconciliation?: ManagedReconciliationState;
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
  readonly reason?: ManagedSynchronizationState["reason"];
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

/** Transient synchronization state is separate from schema-1 bootstrap catalog state. */
export interface ManagedSynchronizationState {
  readonly status:
    | "idle"
    | "queued"
    | "checking"
    | "fetching"
    | "updating"
    | "up_to_date"
    | "updated"
    | "failed"
    | "needs_attention";
  readonly reason?:
    | "local_changes"
    | "local_ahead"
    | "diverged"
    | "default_branch_changed"
    | "upstream_missing"
    | "detached_head"
    | "organization_transfer"
    | "authorization_lost"
    | "remote_unavailable"
    | "network_failure"
    | "rate_limited"
    | "authentication_failed"
    | "invalid_remote_metadata"
    | "local_storage_failure"
    | "unsafe_repository"
    | "interrupted_operation"
    | "wrong_repository";
  readonly diagnostic: string | null;
  readonly retryable: boolean;
  readonly localCommit?: string;
  readonly currentCommit?: string;
  readonly ahead?: number;
  readonly behind?: number;
  readonly lastSuccessfulAt?: string;
  readonly metadata?: { readonly code: string; readonly title: string };
}
export const synchronizationLabel = (state: ManagedSynchronizationState): string =>
  ({
    idle: "Waiting for synchronization",
    queued: "Update queued",
    checking: "Checking…",
    fetching: "Fetching…",
    updating: "Updating…",
    up_to_date: "Up to date",
    updated: "Updated",
    failed: "Course update failed",
    needs_attention: "Needs attention"
  })[state.status];

/** Review projections contain no executable plan context, credentials, or filesystem roots. */
export interface ManagedReconciliationEvidence {
  readonly head: {
    readonly kind: "attached" | "detached" | "unborn";
    readonly branch: string | null;
    readonly commit: string | null;
  };
  readonly upstream:
    | { readonly kind: "missing" }
    | {
        readonly kind: "configured";
        readonly branch: string;
        readonly remote: string | null;
        readonly ahead: number;
        readonly behind: number;
        readonly relation: string;
      };
  readonly files: readonly {
    readonly category:
      | "Modified"
      | "Added"
      | "Deleted"
      | "Renamed"
      | "Staged"
      | "Untracked"
      | "Conflict";
    readonly path: string;
    readonly originalPath?: string;
  }[];
  readonly localCommits: {
    readonly count: number | null;
    readonly commits: readonly {
      readonly id: string;
      readonly subject: string;
      readonly committedAt: string;
    }[];
  };
  readonly operations: readonly string[];
  readonly defaultBranch: string;
}
export interface ManagedReconciliationState {
  readonly status:
    | "idle"
    | "planning"
    | "review_required"
    | "preparing"
    | "cloning_replacement"
    | "preserving_existing"
    | "activating_replacement"
    | "validating"
    | "completed"
    | "failed"
    | "manual_review_required"
    | "stale_plan";
  readonly repositoryId: number;
  readonly planId?: string;
  readonly recoveryId?: string;
  readonly eligible: boolean;
  readonly reason?: ManagedSynchronizationState["reason"];
  readonly diagnostic: string | null;
  readonly retryable: boolean;
  readonly evidence?: ManagedReconciliationEvidence;
}
export const canReviewManagedCache = (course: RemoteCourse): boolean =>
  course.authorization === "authorized" &&
  [
    "local_changes",
    "local_ahead",
    "diverged",
    "default_branch_changed",
    "upstream_missing",
    "detached_head",
    "interrupted_operation",
    "wrong_repository"
  ].includes(course.synchronization?.reason ?? course.bootstrap?.reason ?? "");
