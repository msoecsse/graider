import type { z } from "zod";
import type { gradingStateSchema } from "../grading/grading-state.js";
import type { CommentLibrary } from "../grading/comment-library.js";

/** Outer trusted observation only; never a canonical roster identity or authorization. */
export interface StudentIdentityObservation {
  termCode: string;
  studentId: string;
  githubUserId: number;
  githubLogin: string;
  reference: string;
  provenance: "trusted-identity-evidence";
}
export interface PreservedArtifact {
  provenance: "source" | "runtime";
  location: string;
  contentFingerprint: string | null;
  originalText: string | null;
  /** Exact original bytes, including malformed UTF-8; no checkpoint or relocation. */
  originalBytesBase64: string | null;
  classification: "derived" | "unresolved";
}
export interface PreservationInventory {
  boundary: "staged-phase-9";
  completeness: "unknown";
  preservation: "originals-retained-in-place";
  students: Array<{
    termCode: string;
    sectionId: string;
    location: string;
    rosterFingerprint: string;
    studentId: string;
    githubUsername: string;
    status: string;
    identityState: "unknown" | "observed" | "ambiguous";
    observations: StudentIdentityObservation[];
  }>;
  /** Includes unmatched observations rather than silently discarding them. */
  studentObservations: StudentIdentityObservation[];
  grading: Array<
    PreservedArtifact & {
      termCode: string;
      assignmentSlug: string;
      state: "loaded" | "invalid";
      targetId: string | null;
      targetKind: "individual" | "group" | "unknown";
      sectionPlacement: "exact" | "ambiguous" | "cross_section" | "unmapped";
      sectionIds: string[];
      placementEvidence: string[];
      selectedCommit: string | null;
      commitReachability: "unknown";
      recordedStatus: string | null;
      publicationVerification: "unknown";
      decisions: z.output<typeof gradingStateSchema> | null;
      appliedSnapshots: unknown[];
    }
  >;
  comments: Array<
    PreservedArtifact & {
      state: "loaded" | "missing" | "invalid";
      library: CommentLibrary | null;
      ownership: "unknown";
      history: "unknown";
    }
  >;
  /** Report and other grading artifacts are evidence, never proof of Published. */
  artifacts: PreservedArtifact[];
  deferredWork: string[];
}
