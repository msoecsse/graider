import { z } from "zod";
import { stringify } from "yaml";
import { rawAssignmentConfigSchema, rawCourseConfigV2Schema } from "../config/config-schemas.js";
import { stableJson } from "./migration-evidence.js";
import { rawManifestSchema } from "../manifest/manifest-loader.js";

export { rawManifestSchema as migrationManifestSchema };

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const state = z.enum(["ready", "needs_attention"]);
const provenance = z.enum(["source", "runtime"]);

/** Reject rather than normalize aliases that could overwrite evidence on Windows/macOS. */
export const isPortableMigrationPath = (path: string): boolean =>
  path === path.normalize("NFC") &&
  !/[\\<>:"|?*\p{C}]/u.test(path) &&
  path
    .split("/")
    .every(
      (part) =>
        part !== "" &&
        part !== "." &&
        part !== ".." &&
        part.toLowerCase() !== ".git" &&
        !/[. ]$/u.test(part) &&
        !/^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part)
    );
export const migrationPathSchema = text.refine(
  isPortableMigrationPath,
  "Nonportable migration path."
);
export const migrationSegmentSchema = migrationPathSchema.refine(
  (value) => !value.includes("/"),
  "Expected one path segment."
);
export const migrationCourseSchema = rawCourseConfigV2Schema.safeExtend({
  course: rawCourseConfigV2Schema.shape.course.required({
    repository_id: true,
    organization_binding: true
  })
});

/** Staged migration definition, not the Phase 10 assignment editing/history contract. */
export const migrationAssignmentSchema = rawAssignmentConfigSchema
  .omit({ schema_version: true, sections: true, deadline: true })
  .extend({
    schema_version: z.literal(2),
    assignment: rawAssignmentConfigSchema.shape.assignment
      .omit({ status: true })
      .extend({
        lifecycle: z.enum(["draft", "active", "archived"]).nullable(),
        owners: z.array(id)
      })
      .strict(),
    metadata: rawAssignmentConfigSchema.shape.metadata
      .unwrap()
      .omit({ faculty_owner: true })
      .optional(),
    migration: z
      .object({
        state,
        legacy_status: text,
        owner_repair_required: z.boolean(),
        preserve_operational_history: z.boolean(),
        original_faculty_owner: text.nullable()
      })
      .strict()
  })
  .strict();

export const migrationSectionSchema = z
  .object({
    schema_version: z.literal(2),
    term_code: text,
    assignment_slug: text,
    section_id: text,
    state,
    schedule: rawAssignmentConfigSchema.shape.deadline.unwrap().nullable(),
    usage: z.enum(["available", "prior_activity", "unresolved"]),
    provisioning: z.enum(["not_observed", "complete_evidence", "partial_incomplete", "ambiguous"]),
    manifest_evidence: z.array(
      z
        .object({
          provenance,
          location: migrationPathSchema,
          content_fingerprint: digest.nullable()
        })
        .strict()
    )
  })
  .strict();

const evidenceReference = z
  .object({
    kind: z.enum(["grading", "comments", "artifact", "manifest"]),
    provenance,
    location: migrationPathSchema,
    content_fingerprint: digest.nullable(),
    state: text,
    handling: z.enum(["original-retained-in-place", "source-original-in-audit"]),
    target_id: z.string().nullable().optional(),
    target_kind: z.enum(["individual", "group", "unknown"]).optional(),
    placement_evidence: z.array(text).optional(),
    section_placement: z.enum(["exact", "ambiguous", "cross_section", "unmapped"]).optional(),
    section_ids: z.array(text).optional(),
    selected_commit: z.string().nullable().optional(),
    commit_reachability: z.literal("unknown").optional(),
    recorded_status: z.string().nullable().optional(),
    publication_verification: z.literal("unknown").optional(),
    ownership: z.literal("unknown").optional(),
    history: z.literal("unknown").optional()
  })
  .strict();
const studentObservation = z
  .object({
    termCode: z.string(),
    studentId: z.string(),
    githubUserId: z.number(),
    githubLogin: z.string(),
    reference: z.string(),
    provenance: z.literal("trusted-identity-evidence")
  })
  .strict();

/** Durable provenance/index only: machine-local grading contents remain in place. */
export const migrationMetadataSchema = z
  .object({
    schema_version: z.literal(1),
    boundary: z.literal("staged-phase-9"),
    decision: z.literal("A"),
    decision_reference: z.literal(
      "https://github.com/msoecsse/graider/issues/16#issuecomment-6690809434"
    ),
    publication_ready: z.literal(false),
    source: z
      .object({
        repository_id: id,
        organization_id: id,
        source_commit_sha: sha,
        report_id: digest,
        authenticated_github_user_id: id
      })
      .strict(),
    role_history: z.literal("earlier-history-unavailable"),
    runtime_coverage: z.enum(["not_applicable", "machine_local", "unavailable"]),
    completeness: z.literal("unknown"),
    findings: z.array(
      z
        .object({
          origin: z.enum(["analysis", "assignment", "grader"]),
          code: text,
          message: text,
          location: text.optional(),
          term_code: text.optional(),
          assignment_slug: text.optional(),
          section_id: text.optional()
        })
        .strict()
    ),
    publication_blockers: z.array(text),
    deferred_work: z.array(text),
    evidence: z.array(evidenceReference),
    students: z.array(
      z
        .object({
          termCode: text,
          sectionId: text,
          location: migrationPathSchema,
          rosterFingerprint: digest,
          studentId: text,
          githubUsername: text,
          status: text,
          identityState: z.enum(["unknown", "observed", "ambiguous"]),
          observations: z.array(studentObservation)
        })
        .strict()
    ),
    student_observations: z.array(studentObservation),
    student_identity: z.literal("preserved-evidence-only-phase-13"),
    grading: z.literal("preserved-in-place-phase-14-no-remote-durability-claim"),
    reconciliation: z
      .object({
        phase: z.literal("after_publication"),
        state: z.literal("not_executed"),
        delete_team: z.literal(false),
        delete_memberships: z.literal(false),
        grants: z.array(
          z
            .object({
              organization_id: id,
              team_id: id,
              repository_id: id,
              observed_permission: z.enum(["none", "pull", "triage", "push", "maintain", "admin"]),
              requires: z.literal("published_v2_and_verified_managed_replacement_access")
            })
            .strict()
        )
      })
      .strict(),
    audit: z
      .object({
        // Only source files changed by the proposal. Runtime originals are never uploaded here.
        original_files: z.array(
          z.object({ path: migrationPathSchema, bytes_base64: z.string(), sha256: digest }).strict()
        ),
        review: z
          .object({
            source: z
              .object({
                repositoryId: id,
                sourceCommitSha: sha,
                reportId: digest,
                authenticatedGithubUserId: id
              })
              .strict(),
            acknowledgements: z.array(
              z
                .object({
                  kind: z.enum(["ownerless_assignment", "legacy_closed", "group_targets"]),
                  termCode: text,
                  assignmentSlug: text
                })
                .strict()
            ),
            grader_inventory_id: text,
            member_decisions: z.array(
              z
                .object({
                  githubUserId: id,
                  disposition: z.enum(["existing_sufficient", "no_access", "assign"]),
                  sections: z.array(z.object({ termCode: text, sectionId: text }).strict())
                })
                .strict()
            )
          })
          .strict()
      })
      .strict()
  })
  .strict();

/** Parse first, sort object keys, preserve meaningful array/history order, LF and final newline. */
export const serializeMigrationYaml = <T>(schema: z.ZodType<T>, value: unknown): string =>
  stringify(JSON.parse(stableJson(schema.parse(value))) as unknown, { lineWidth: 0 });
export const serializeMigrationJson = <T>(schema: z.ZodType<T>, value: unknown): string =>
  `${stableJson(schema.parse(value))}\n`;
