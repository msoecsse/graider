import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
/** Decisions are durable hints, never executable review/completion capabilities. */
export interface MigrationReviewProgress {
  readonly version: 1;
  readonly organizationId: number;
  readonly reviewIdentity: string;
  readonly submission: Backend.MigrationReviewSubmission;
  readonly identities: readonly Backend.VerifiedMigrationFaculty["identity"][];
  readonly choices: readonly Backend.VerifiedMigrationFaculty["identity"][];
  readonly grader: {
    readonly fingerprint: string;
    readonly submission: Backend.GraderAccessSubmission;
  } | null;
}
export interface MigrationReviewProgressStore {
  read(userId: number, repositoryId: number): MigrationReviewProgress | null;
  write(value: unknown): void;
}
