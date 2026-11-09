/** Sanitized notification only. Never an executable mutation ticket. */
export type CourseMutationMode =
  | "new_mutation"
  | "publication_retry"
  | "source_update"
  | "cutover"
  | "read";
/** Main-only context. The freshness closure is never serialized or accepted over IPC. */
export interface VerifiedCourseMutationContext {
  readonly revalidate?: (revision?: string) => Promise<void>;
  readonly managed?: boolean;
  readonly sessionGeneration?: number;
  readonly legacyFolderPath?: string;
  readonly userId: number;
  readonly repositoryId: number;
  readonly authoritativeCommit: string;
  readonly operationalCommit: string;
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly mode: CourseMutationMode;
}
/** Local cache revision only; cannot authorize a remote mutation or publication. */
export interface VerifiedLocalCourseReadContext extends Omit<
  VerifiedCourseMutationContext,
  "mode" | "authoritativeCommit" | "revalidate"
> {
  readonly mode: "local_read";
  readonly cachedCommit: string;
  readonly revalidate?: never;
}
export type VerifiedCourseOperationContext =
  | VerifiedCourseMutationContext
  | VerifiedLocalCourseReadContext;
export const courseContextRevision = (context: VerifiedCourseOperationContext): string =>
  context.mode === "local_read" ? context.cachedCommit : context.authoritativeCommit;
export interface CourseMutationBlock {
  readonly status: "blocked";
  readonly reason:
    | "remote_version_conflict"
    | "publication_failed"
    | "publication_outcome_unknown"
    | "synchronization_retry_required"
    | "managed_cache_review_required"
    | "managed_cache_manual_review_required"
    | "authorization_required"
    | "faculty_identity_required"
    | "course_access_lost"
    | "organization_migration_required"
    | "operational_source_stale"
    | "operational_source_updateable"
    | "view_refresh_required"
    | "operational_source_mismatch"
    | "operational_source_unsafe"
    | "remote_only_mutation_unavailable"
    | "operation_unavailable"
    | "operation_not_authorized"
    | "reconciliation_required"
    | "local_storage_failure";
  readonly repositoryId?: number;
  readonly courseFolderId?: string;
  readonly message: string;
  readonly action:
    | "retry"
    | "review_cache"
    | "faculty_settings"
    | "authorization"
    | "attention"
    | "update_source"
    | "refresh_view";
  readonly retryable: boolean;
}
export type CourseMutationNotice =
  | CourseMutationBlock
  | { readonly status: "source_updated" | "view_invalidated" | "published_refresh_required" }
  | { readonly status: "checking" | "finished" };
export const COURSE_MUTATION_NOTICE = "graider-ui:course-mutation:notice";
