/** Sanitized notification only. Never an executable mutation ticket. */
export interface CourseMutationBlock {
  readonly status: "blocked";
  readonly reason:
    | "synchronization_retry_required"
    | "managed_cache_review_required"
    | "managed_cache_manual_review_required"
    | "authorization_required"
    | "faculty_identity_required"
    | "course_access_lost"
    | "organization_migration_required"
    | "operational_source_stale"
    | "operational_source_mismatch"
    | "operational_source_unsafe"
    | "remote_only_mutation_unavailable"
    | "local_storage_failure";
  readonly repositoryId?: number;
  readonly message: string;
  readonly action: "retry" | "review_cache" | "faculty_settings" | "authorization" | "attention";
  readonly retryable: boolean;
}
export type CourseMutationNotice =
  | CourseMutationBlock
  | { readonly status: "checking" | "finished" };
export const COURSE_MUTATION_NOTICE = "graider-ui:course-mutation:notice";
