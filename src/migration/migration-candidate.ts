import { parse } from "yaml";
import { rawTermConfigV2Schema } from "../config/config-schemas.js";
import type { RawAssignmentConfig } from "../config/config-models.js";
import type { AssignmentMigrationPlan } from "./assignment-migration-models.js";
import { planAssignmentMigration } from "./assignment-migration-planner.js";
import type { GraderRemovalPlan } from "./grader-removal-models.js";
import { planGraderRemoval } from "./grader-removal-planner.js";
import type { CourseMigrationAnalysis, Immutable, MigrationSnapshot } from "./migration-models.js";
import type { MigrationReviewResult } from "./migration-review-models.js";
import { analyzeSchemaV1Migration } from "./schema-v1-migration-analyzer.js";
import { legacyRecoveryPlan } from "./migration-recovery-plan.js";
import {
  compare,
  freeze,
  stableJson,
  textHash,
  bytesHash,
  fingerprint,
  sortedUnique
} from "./migration-evidence.js";
import {
  migrationAssignmentSchema,
  migrationCourseSchema,
  migrationSectionSchema,
  migrationMetadataSchema,
  migrationManifestSchema,
  migrationPathSchema,
  migrationSegmentSchema,
  serializeMigrationYaml,
  serializeMigrationJson
} from "./migration-candidate-schemas.js";

export const STAGED_PHASE_9_BOUNDARY = Object.freeze({
  boundary: "staged-phase-9",
  decision: "A",
  reference: "https://github.com/msoecsse/graider/issues/16#issuecomment-6690809434"
});
export const MIGRATION_METADATA_PATH = ".graider/migration.json";
export interface MigrationCandidateInput {
  /** Exact backend-retained 9.1 read snapshot. Full reanalysis must match, including report ID.
   * Kept separate from renderer-visible analysis; not an alternate source file inventory. */
  readonly snapshot: Immutable<MigrationSnapshot>;
  readonly analysis: CourseMigrationAnalysis;
  readonly review: MigrationReviewResult;
  /** Exact artifacts obtained through the trusted 9.3/9.4 handoffs, never IPC assertions. */
  readonly assignmentPlan: AssignmentMigrationPlan;
  readonly graderRemovalPlan: GraderRemovalPlan;
  readonly boundary: {
    readonly boundary: string;
    readonly decision: string;
    readonly reference: string;
  };
}
export interface MigrationCandidateFile {
  path: string;
  kind: "course" | "term" | "assignment" | "section" | "manifest" | "preserved" | "metadata";
  /** bytesBase64 is authoritative for preserved non-UTF-8 evidence. */
  content: string;
  bytesBase64: string;
  sha256: string;
}
interface MigrationCandidateData {
  kind: "schema-v2-migration-candidate";
  status: "ready" | "needs_attention" | "blocked";
  publicationReady: false;
  source: MigrationReviewResult["source"];
  boundary: typeof STAGED_PHASE_9_BOUNDARY;
  files: MigrationCandidateFile[];
  problems: string[];
  preservation: CourseMigrationAnalysis["preservation"];
  /** Non-executable evidence, detached from desired state. Never publication proof. */
  audit: {
    review: MigrationReviewResult;
    assignmentPlan: AssignmentMigrationPlan;
    graderRemovalPlan: GraderRemovalPlan;
    originalFiles: MigrationCandidateFile[];
    /** Exact local originals retained only as evidence; excluded from proposed repository files. */
    runtimeFiles: MigrationCandidateFile[];
  };
}
export type MigrationCandidate = Immutable<MigrationCandidateData>;
const same = (left: unknown, right: unknown): boolean => stableJson(left) === stableJson(right);
const unpublishedReview = (value: {
  readonly kind: unknown;
  readonly publicationReady: unknown;
}): boolean => value.kind === "schema-v1-migration-review" && value.publicationReady === false;
const references = (ids: readonly number[]) =>
  [...ids].sort((left, right) => left - right).map((github_user_id) => ({ github_user_id }));

/** Validate a complete file namespace, including case aliases of directory prefixes. */
const assertNamespace = (files: readonly MigrationCandidateFile[]): void => {
  const nodes = new Map<string, { path: string; file: boolean }>();
  for (const entry of files) {
    migrationPathSchema.parse(entry.path);
    const parts = entry.path.split("/");
    parts.forEach((_, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const key = path.toLowerCase();
      const file = index === parts.length - 1;
      const previous = nodes.get(key);
      if (previous && (previous.path !== path || previous.file || file))
        throw new Error("Candidate paths alias or collide.");
      nodes.set(key, { path, file });
    });
  }
};

/** Pure proposed write model. Outer main-process code must retain/revalidate the trusted
 * handoffs; this function performs no freshness reads and grants no publication authority.
 * Reproject exact evidence/plans rather than accepting replacement inventories or raw YAML.
 */
export const buildMigrationCandidate = (input: MigrationCandidateInput): MigrationCandidate => {
  const { analysis, review, assignmentPlan, graderRemovalPlan: removal } = input;
  const candidate: MigrationCandidateData = {
    kind: "schema-v2-migration-candidate",
    status: "ready",
    publicationReady: false,
    source: review.source,
    boundary: STAGED_PHASE_9_BOUNDARY,
    files: [],
    problems: [],
    preservation: analysis.preservation,
    audit: {
      review,
      assignmentPlan,
      graderRemovalPlan: removal,
      originalFiles: [],
      runtimeFiles: []
    }
  };
  const finish = (): MigrationCandidate => freeze(structuredClone(candidate));
  const block = (problem: string): MigrationCandidate => {
    candidate.status = "blocked";
    candidate.files = [];
    candidate.audit.originalFiles = [];
    candidate.problems.push(problem);
    return finish();
  };
  try {
    const expectedSource = {
      repositoryId: analysis.source.repositoryId,
      sourceCommitSha: analysis.source.sourceCommitSha,
      reportId: analysis.reportId,
      authenticatedGithubUserId: analysis.source.authenticatedGithubUserId
    };
    if (
      !same(input.boundary, STAGED_PHASE_9_BOUNDARY) ||
      !same(analysis, analyzeSchemaV1Migration(structuredClone(input.snapshot))) ||
      !same(review.source, expectedSource) ||
      !same(review.preservation, analysis.preservation) ||
      !same(assignmentPlan, planAssignmentMigration(analysis, review)) ||
      !same(
        removal,
        planGraderRemoval(
          analysis,
          review,
          assignmentPlan,
          removal.audit.inventory,
          removal.audit.accessReview
        )
      )
    )
      return block(
        "Candidate inputs do not match the exact trusted source, review, inventory, plans and accepted boundary."
      );
    if (
      !analysis.validatedMigrationFacts ||
      analysis.status === "blocked" ||
      !unpublishedReview(review) ||
      review.status !== "complete" ||
      assignmentPlan.status === "blocked" ||
      removal.status === "blocked" ||
      !removal.persistedCleanup ||
      review.organizationCondition !== "organization_reconciled" ||
      !same(review.organizationCondition, analysis.organization.value)
    )
      return block(
        "Validated source, completed reviews and reconciled immutable organization binding are required."
      );

    // Validate exact bytes for every file, including unrelated data and runtime evidence.
    const originalFiles: MigrationCandidateFile[] = [];
    for (const provenance of ["source", "runtime"] as const) {
      const snapshot = input.snapshot;
      const files = provenance === "source" ? snapshot.sourceFiles : snapshot.runtime.files;
      const byteFiles =
        provenance === "source" ? snapshot.sourceBytesBase64 : snapshot.runtime.bytesBase64;
      if (Object.keys(byteFiles ?? {}).some((path) => !Object.hasOwn(files, path)))
        return block("Byte inventory contains a file absent from the trusted text inventory.");
      const entries = Object.entries(files).map(([path, content]): MigrationCandidateFile => {
        const bytesBase64 =
          byteFiles && Object.hasOwn(byteFiles, path)
            ? (byteFiles[path] ?? "")
            : Buffer.from(content).toString("base64");
        const bytes = Buffer.from(bytesBase64, "base64");
        if (bytes.toString("base64") !== bytesBase64 || bytes.toString("utf8") !== content)
          throw new Error("Evidence byte inventory disagrees with original content.");
        return { path, content, bytesBase64, sha256: bytesHash(bytes), kind: "preserved" };
      });
      assertNamespace(entries);
      if (provenance === "source") originalFiles.push(...entries);
      else
        candidate.audit.runtimeFiles = entries.sort((left, right) =>
          compare(left.path, right.path)
        );
    }
    const files = new Map(originalFiles.map((entry) => [entry.path, entry]));
    if (files.has(".graider/reconciliation.json"))
      return block("Reserved reconciliation journal already exists in source.");
    const generated = new Set<string>();
    const put = (
      path: string,
      content: string,
      kind: MigrationCandidateFile["kind"],
      replace: boolean
    ): void => {
      migrationPathSchema.parse(path);
      if (generated.has(path) || (!replace && files.has(path)))
        throw new Error("Generated file would overwrite unrelated source evidence.");
      const original = files.get(path);
      if (original) candidate.audit.originalFiles.push(original);
      generated.add(path);
      files.set(path, {
        path,
        content,
        bytesBase64: Buffer.from(content).toString("base64"),
        sha256: textHash(content),
        kind
      });
    };

    const originalCourse = analysis.courseConfigurationEvidence?.value;
    if (!originalCourse) return block("Validated course configuration is unavailable.");
    const github = { ...originalCourse.github };
    delete github.grader_team;
    delete github.grader_permission;
    put(
      "course.yml",
      serializeMigrationYaml(migrationCourseSchema, {
        ...originalCourse,
        schema_version: 2,
        github: { ...github, organization: analysis.source.organizationLogin },
        course: {
          ...originalCourse.course,
          repository: analysis.source.repositoryName,
          repository_id: analysis.source.repositoryId,
          organization_binding: {
            organization_id: analysis.source.organizationId,
            organization_login: analysis.source.organizationLogin
          },
          lifecycle: review.courseLifecycle,
          term_creation_order: review.termCreationOrder
        },
        faculty_directory: [...review.facultyDirectory].sort(
          (left, right) => left.github_user_id - right.github_user_id
        ),
        fallback_administrator: { github_user_id: review.fallbackAdministratorGithubUserId }
      }),
      "course",
      true
    );

    for (const term of removal.facultyTerms) {
      const original = analysis.terms.find((entry) => entry.code === term.termCode);
      if (!original) return block("Reviewed term does not exist in the trusted source.");
      put(
        `terms/${term.termCode}/term.yml`,
        serializeMigrationYaml(rawTermConfigV2Schema, {
          schema_version: 2,
          term: {
            code: original.code,
            academic_year: original.academicYear,
            semester: original.semester,
            display_name: original.displayName,
            status: term.status,
            has_ever_been_active: term.hasEverBeenActive
          },
          coordinators: { current: references(term.currentCoordinatorGithubUserIds), former: [] },
          sections: [...term.sections]
            .sort((left, right) => compare(left.sectionId, right.sectionId))
            .map((section) => {
              const source = original.sections.find((entry) => entry.id === section.sectionId);
              if (!source || section.currentFacultyGithubUserIds === null)
                throw new Error("Section references are unresolved.");
              migrationSegmentSchema.parse(section.sectionId);
              if (source.roster !== null) migrationPathSchema.parse(source.roster);
              return {
                id: source.id,
                ...(source.roster === null ? {} : { roster: source.roster }),
                faculty: { current: references(section.currentFacultyGithubUserIds), former: [] }
              };
            })
        }),
        "term",
        true
      );
    }

    for (const assignment of assignmentPlan.assignments) {
      const root = `terms/${assignment.termCode}/assignments/${assignment.assignmentSlug}`;
      migrationSegmentSchema.parse(assignment.assignmentSlug);
      const original = assignment.configurationEvidence.value;
      const preserved: Partial<RawAssignmentConfig> = structuredClone(
        original
      ) as RawAssignmentConfig;
      delete preserved.sections;
      delete preserved.deadline;
      const definition = original.assignment;
      const metadata = original.metadata;
      const preservedMetadata = { ...metadata };
      delete preservedMetadata.faculty_owner;
      const lifecycle =
        assignment.legacyStatus === "closed" ||
        assignmentPlan.findings.some(
          (finding) =>
            finding.code === "draft_activity_conflict" &&
            finding.termCode === assignment.termCode &&
            finding.assignmentSlug === assignment.assignmentSlug
        )
          ? null
          : assignment.legacyStatus;
      put(
        `${root}/assignment.yml`,
        serializeMigrationYaml(migrationAssignmentSchema, {
          ...preserved,
          schema_version: 2,
          assignment: {
            slug: definition.slug,
            title: definition.title,
            type: definition.type,
            lifecycle,
            owners: assignment.owners
          },
          ...(metadata === undefined ? {} : { metadata: preservedMetadata }),
          migration: {
            state: assignment.status,
            legacy_status: assignment.legacyStatus,
            owner_repair_required: assignment.ownerRepairRequired,
            preserve_operational_history: assignment.preserveOperationalHistory,
            original_faculty_owner: assignment.originalFacultyOwner
          }
        }),
        "assignment",
        true
      );
      for (const section of assignment.sections) {
        migrationSegmentSchema.parse(section.sectionId);
        put(
          `${root}/sections/${section.sectionId}.yml`,
          serializeMigrationYaml(migrationSectionSchema, {
            schema_version: 2,
            term_code: assignment.termCode,
            assignment_slug: assignment.assignmentSlug,
            section_id: section.sectionId,
            state: section.status,
            schedule: section.schedule,
            usage: section.usage,
            provisioning: section.provisioning,
            manifest_evidence: section.manifestEvidenceIndices.map((index) => {
              const manifest = assignment.manifests[index];
              if (!manifest) throw new Error("Manifest evidence reference is invalid.");
              return {
                provenance: manifest.provenance,
                location: manifest.location,
                content_fingerprint: manifest.contentFingerprint
              };
            })
          }),
          "section",
          false
        );
      }
    }
    const manifests = [
      ...analysis.assignments.flatMap((entry) => entry.manifests),
      ...analysis.unassignedManifests
    ];
    for (const manifest of manifests) {
      if (
        manifest.provenance === "source" &&
        manifest.state === "loaded" &&
        manifest.schemaVersion === 1
      ) {
        const source = files.get(manifest.location);
        if (!source) return block("Manifest source evidence is unavailable.");
        const cleaned = migrationManifestSchema.parse(parse(source.content));
        cleaned.repositories.forEach((repository) => {
          delete repository.permissions.grader_team;
        });
        put(
          manifest.location,
          serializeMigrationYaml(migrationManifestSchema, cleaned),
          "manifest",
          true
        );
      }
    }

    const preservation = analysis.preservation;
    const findings = [
      ...analysis.issues.map((entry) => ({
        origin: "analysis",
        code: entry.code,
        message: entry.message,
        location: entry.location
      })),
      ...assignmentPlan.findings.map((entry) => ({
        origin: "assignment",
        code: entry.code,
        message: entry.message,
        ...(entry.termCode === undefined ? {} : { term_code: entry.termCode }),
        ...(entry.assignmentSlug === undefined ? {} : { assignment_slug: entry.assignmentSlug }),
        ...(entry.sectionId === undefined ? {} : { section_id: entry.sectionId })
      })),
      ...removal.findings.map((entry) => ({
        origin: "grader",
        code: entry.code,
        message: entry.message
      }))
    ].sort((left, right) => compare(stableJson(left), stableJson(right)));
    // Cross-machine completeness remains unknown even when every local conversion is ready.
    candidate.status = "needs_attention";
    put(
      MIGRATION_METADATA_PATH,
      serializeMigrationJson(migrationMetadataSchema, {
        schema_version: 1,
        boundary: STAGED_PHASE_9_BOUNDARY.boundary,
        decision: STAGED_PHASE_9_BOUNDARY.decision,
        decision_reference: STAGED_PHASE_9_BOUNDARY.reference,
        publication_ready: false,
        source: {
          repository_id: analysis.source.repositoryId,
          organization_id: analysis.source.organizationId,
          source_commit_sha: analysis.source.sourceCommitSha,
          report_id: analysis.reportId,
          authenticated_github_user_id: analysis.source.authenticatedGithubUserId
        },
        role_history: "earlier-history-unavailable",
        runtime_coverage: analysis.runtimeCoverage,
        completeness: preservation.completeness,
        findings,
        publication_blockers: sortedUnique(review.publicationBlockers),
        deferred_work: sortedUnique([
          ...preservation.deferredWork,
          ...review.deferredMigrationWork
        ]),
        evidence: [
          ...preservation.grading.map((entry) => ({
            kind: "grading",
            provenance: entry.provenance,
            location: entry.location,
            content_fingerprint: entry.contentFingerprint,
            state: entry.state,
            handling: "original-retained-in-place",
            target_id: entry.targetId,
            target_kind: entry.targetKind,
            placement_evidence: entry.placementEvidence,
            section_placement: entry.sectionPlacement,
            section_ids: entry.sectionIds,
            selected_commit: entry.selectedCommit,
            commit_reachability: entry.commitReachability,
            recorded_status: entry.recordedStatus,
            publication_verification: entry.publicationVerification
          })),
          ...preservation.comments.map((entry) => ({
            kind: "comments",
            provenance: entry.provenance,
            location: entry.location,
            content_fingerprint: entry.contentFingerprint,
            state: entry.state,
            handling: "original-retained-in-place",
            ownership: entry.ownership,
            history: entry.history
          })),
          ...preservation.artifacts.map((entry) => ({
            kind: "artifact",
            provenance: entry.provenance,
            location: entry.location,
            content_fingerprint: entry.contentFingerprint,
            state: entry.classification,
            handling: "original-retained-in-place"
          })),
          ...manifests.map((entry) => ({
            kind: "manifest",
            provenance: entry.provenance,
            location: entry.location,
            content_fingerprint: entry.contentFingerprint,
            state: entry.state,
            handling:
              entry.provenance === "source" && generated.has(entry.location)
                ? "source-original-in-audit"
                : "original-retained-in-place"
          }))
        ].sort((left, right) => compare(stableJson(left), stableJson(right))),
        students: preservation.students,
        student_observations: preservation.studentObservations,
        student_identity: "preserved-evidence-only-phase-13",
        grading: "preserved-in-place-phase-14-no-remote-durability-claim",
        recovery: {
          version: 1,
          review_digest: fingerprint(review),
          legacy: legacyRecoveryPlan(removal)
        },
        reconciliation: {
          phase: removal.reconciliation.phase,
          state: "not_executed",
          delete_team: false,
          delete_memberships: false,
          grants: removal.reconciliation.grants.map((entry) => ({
            organization_id: entry.organizationId,
            team_id: entry.teamId,
            repository_id: entry.repositoryId,
            observed_permission: entry.observedPermission,
            requires: entry.requires
          }))
        },
        audit: {
          original_files: candidate.audit.originalFiles
            .map((entry) => ({
              path: entry.path,
              bytes_base64: entry.bytesBase64,
              sha256: entry.sha256
            }))
            .sort((left, right) => compare(left.path, right.path)),
          review: {
            source: review.source,
            acknowledgements: review.acknowledgements,
            grader_inventory_id: removal.audit.accessReview.inventoryId,
            member_decisions: removal.audit.accessReview.decisions
          }
        }
      }),
      "metadata",
      false
    );
    candidate.files = [...files.values()].sort((left, right) => compare(left.path, right.path));
    assertNamespace(candidate.files);
    candidate.audit.originalFiles.sort((left, right) => compare(left.path, right.path));
    return finish();
  } catch {
    return block("Candidate schema, evidence integrity or portable path validation failed.");
  }
};
