import { parse } from "yaml";
import { rawTermConfigV2Schema } from "../config/config-schemas.js";
import {
  buildMigrationCandidate,
  MIGRATION_METADATA_PATH,
  type MigrationCandidate,
  type MigrationCandidateFile,
  type MigrationCandidateInput
} from "./migration-candidate.js";
import {
  migrationAssignmentSchema,
  migrationCourseSchema,
  migrationMetadataSchema,
  migrationManifestSchema,
  migrationPathSchema,
  migrationSectionSchema
} from "./migration-candidate-schemas.js";
import {
  bytesHash,
  compare,
  fingerprint,
  freeze,
  stableJson,
  isId,
  isSha
} from "./migration-evidence.js";
import { requiredMigrationAcknowledgements } from "./migration-review-validation.js";
import {
  publicationBindingSchema,
  validateMigrationCompatibility
} from "./migration-compatibility-validation.js";
import type {
  MigrationPublicationBinding,
  MigrationPublicationContext,
  MigrationPublicationSession,
  MigrationPublicationResult,
  MigrationPublicationResultData,
  MigrationPublicationBlockerCode
} from "./migration-publication-models.js";
export type {
  MigrationPublicationContext,
  MigrationCompatibilityEvidence,
  MigrationPublicationBinding,
  MigrationPublicationResult
} from "./migration-publication-models.js";

const same = (left: unknown, right: unknown): boolean => stableJson(left) === stableJson(right);
const sortedFiles = (files: readonly MigrationCandidateFile[]) =>
  [...files].sort((a, b) => compare(a.path, b.path));
/** Exact bytes, file kinds, source and complete non-executable audit. Object-key and file
 * enumeration order are irrelevant; review, lifecycle and history array order is retained. */
export const migrationCandidateFingerprint = (candidate: MigrationCandidate): string =>
  fingerprint({
    ...candidate,
    files: sortedFiles(candidate.files),
    audit: {
      ...candidate.audit,
      originalFiles: sortedFiles(candidate.audit.originalFiles),
      runtimeFiles: sortedFiles(candidate.audit.runtimeFiles)
    }
  });
/** Derivation only, never an authority receipt. Main must retain and independently
 * revalidate the session/completion and the resulting binding at every boundary. */
export const migrationPublicationBinding = (
  artifacts: MigrationCandidateInput,
  candidate: MigrationCandidate,
  session: MigrationPublicationSession
): MigrationPublicationBinding =>
  freeze({
    ...session,
    repositoryId: artifacts.analysis.source.repositoryId,
    organizationId: artifacts.analysis.source.organizationId ?? 0,
    authenticatedGithubUserId: artifacts.analysis.source.authenticatedGithubUserId,
    sourceCommitSha: artifacts.analysis.source.sourceCommitSha,
    reportId: artifacts.analysis.reportId,
    reviewId: fingerprint(artifacts.review),
    assignmentPlanId: fingerprint(artifacts.assignmentPlan),
    graderRemovalPlanId: fingerprint(artifacts.graderRemovalPlan),
    candidateFingerprint: migrationCandidateFingerprint(candidate)
  });

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const read = (file: MigrationCandidateFile): unknown =>
  file.path.endsWith(".json")
    ? (JSON.parse(file.content) as unknown)
    : (parse(file.content) as unknown);
const hasGraderFields = (value: unknown): boolean => {
  const record = object(value);
  return Array.isArray(value)
    ? value.some(hasGraderFields)
    : record !== null &&
        Object.entries(record).some(
          ([key, item]) =>
            key === "grader_team" || key === "grader_permission" || hasGraderFields(item)
        );
};
type AddBlocker = (code: MigrationPublicationBlockerCode, location: string, action: string) => void;

/** Validate portable path namespace with case aliases at every directory prefix. */
const validateFiles = (files: readonly MigrationCandidateFile[], add: AddBlocker): void => {
  const nodes = new Map<string, { path: string; file: boolean }>();
  for (const entry of files) {
    if (!migrationPathSchema.safeParse(entry.path).success)
      add(
        "unsafe_path",
        entry.path,
        "Use a canonical portable relative path without aliases, traversal, reserved names or Git metadata."
      );
    const parts = entry.path.split("/");
    parts.forEach((_, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const key = path.toLowerCase();
      const file = index === parts.length - 1;
      const previous = nodes.get(key);
      if (previous && (previous.path !== path || previous.file || file))
        add(
          "unsafe_path",
          entry.path,
          "Resolve duplicate, case-alias or file/directory collisions before publication."
        );
      nodes.set(key, { path, file });
    });
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (
      bytes.toString("base64") !== entry.bytesBase64 ||
      bytes.toString("utf8") !== entry.content ||
      bytesHash(bytes) !== entry.sha256
    )
      add(
        "file_integrity_invalid",
        entry.path,
        "Restore the exact candidate bytes, decoded content and SHA-256 from trusted artifacts."
      );
  }
};

/** Complete-course semantic validation, independent of candidate reprojection. Unknown
 * histories are not synthesized; Phase 9 can publish only the reviewed current roles. */
const validateSnapshot = (
  context: MigrationPublicationContext,
  candidate: MigrationCandidate,
  expected: MigrationCandidate,
  add: AddBlocker
): void => {
  const { analysis, review, assignmentPlan, graderRemovalPlan } = context.artifacts;
  const files = new Map(candidate.files.map((entry) => [entry.path, entry]));
  const expectedFiles = new Map(expected.files.map((entry) => [entry.path, entry]));
  const directoryIds = new Set(review.facultyDirectory.map((entry) => entry.github_user_id));
  let activeCount = 0;
  const termCodes: string[] = [];
  for (const file of candidate.files) {
    const original = expectedFiles.get(file.path);
    // Preserved files and audit branches are evidence, never desired authorization state.
    if (file.kind !== "preserved" && file.kind !== "metadata") {
      try {
        if (hasGraderFields(read(file)))
          add(
            "grader_desired_state",
            file.path,
            "Remove active grader desired fields; retain originals only as non-executable audit evidence."
          );
      } catch {
        /* Parsing below reports the closed schema problem. */
      }
    }
    if (file.kind === "preserved") {
      if (!original || !same(file, original))
        add(
          "file_preservation_invalid",
          file.path,
          "Retain every unrelated, roster, grading and reusable-comment file byte-for-byte at its original location."
        );
    } else {
      let data: unknown;
      try {
        data = read(file);
      } catch {
        add("schema_unsupported", file.path, "Restore a valid supported candidate document.");
      }
      if (
        file.kind !== "manifest" &&
        file.kind !== "metadata" &&
        object(data)?.schema_version !== 2
      )
        add(
          "schema_unsupported",
          file.path,
          "Only the strict staged Schema v2 candidate shape is supported."
        );
      if (file.kind === "course") {
        const parsed = migrationCourseSchema.safeParse(data);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            const field = String(issue.path[0] ?? "");
            add(
              field === "faculty_directory" || field === "fallback_administrator"
                ? "faculty_directory_invalid"
                : "course_identity_invalid",
              file.path,
              "Restore strict course configuration, unique faculty identities and exactly one valid fallback reference."
            );
          }
        } else {
          const course = parsed.data;
          const source = analysis.source;
          if (
            course.course.repository_id !== source.repositoryId ||
            course.course.repository !== source.repositoryName ||
            course.course.organization_binding.organization_id !== source.organizationId ||
            course.course.organization_binding.organization_login !== source.organizationLogin ||
            course.github.organization !== source.organizationLogin ||
            !same(
              [...course.faculty_directory].sort((a, b) => a.github_user_id - b.github_user_id),
              [...review.facultyDirectory].sort((a, b) => a.github_user_id - b.github_user_id)
            )
          )
            add(
              "course_identity_invalid",
              file.path,
              "Use exact trusted immutable repository/organization identity, locators and reviewed faculty directory."
            );
          if (!same(course.course.term_creation_order, review.termCreationOrder))
            add(
              "term_creation_order_invalid",
              file.path,
              "Retain the exact explicitly confirmed creation order."
            );
          if (
            course.course.lifecycle === "archived" &&
            review.terms.some((term) => term.status !== "archived")
          )
            add(
              "term_lifecycle_invalid",
              file.path,
              "An Archived course may contain only Archived terms."
            );
        }
        // Report incomplete coverage even if another course schema constraint also failed.
        const order: unknown = object(object(data)?.course)?.term_creation_order;
        if (
          !Array.isArray(order) ||
          !same([...(order as unknown[])].sort(), analysis.terms.map((term) => term.code).sort()) ||
          new Set(order).size !== order.length
        )
          add(
            "term_creation_order_invalid",
            file.path,
            "Creation order must cover every existing term exactly once."
          );
      }
      if (file.kind === "term") {
        const parsed = rawTermConfigV2Schema.safeParse(data);
        if (!parsed.success) {
          for (const issue of parsed.error.issues)
            add(
              issue.path[0] === "term" ? "term_lifecycle_invalid" : "faculty_history_invalid",
              file.path,
              "Restore valid lifecycle/activation evidence and distinct current/former faculty histories."
            );
        } else {
          const term = parsed.data;
          termCodes.push(term.term.code);
          if (term.term.status === "active") activeCount += 1;
          const source = analysis.terms.find((entry) => entry.code === term.term.code);
          if (
            !source ||
            file.path !== `terms/${term.term.code}/term.yml` ||
            (source.lifecycle.hasEverBeenActive.value === true && !term.term.has_ever_been_active)
          )
            add(
              "term_lifecycle_invalid",
              file.path,
              "Retain canonical term identity and irreversible source-proven activation history."
            );
          if (
            new Set(term.sections.map((section) => section.id)).size !== term.sections.length ||
            !same(
              term.sections.map((section) => section.id).sort(),
              source?.sections.map((section) => section.id).sort()
            )
          )
            add(
              "section_reference_invalid",
              file.path,
              "Sections must uniquely cover the exact trusted term inventory."
            );
          const histories = [term.coordinators, ...term.sections.map((section) => section.faculty)];
          if (
            !term.coordinators.current.length ||
            histories.some((history) =>
              [...history.current, ...history.former].some(
                (ref) => !directoryIds.has(ref.github_user_id)
              )
            )
          )
            add(
              "faculty_reference_invalid",
              file.path,
              "Select current coordinators and resolve every role reference through the verified faculty directory."
            );
          if (histories.some((history) => history.former.length > 0))
            add(
              "faculty_history_invalid",
              file.path,
              "These migration artifacts prove no former intervals; do not invent earlier role history."
            );
          for (const section of term.sections)
            if (
              section.roster !== undefined &&
              !migrationPathSchema.safeParse(section.roster).success
            )
              add("unsafe_path", file.path, "Use a safe canonical roster reference.");
        }
      }
      if (file.kind === "assignment") {
        const parsed = migrationAssignmentSchema.safeParse(data);
        if (!parsed.success)
          add(
            "schema_unsupported",
            file.path,
            "Restore the strict supported staged assignment definition."
          );
        else {
          const task = parsed.data;
          const owners = task.assignment.owners;
          if (
            new Set(owners).size !== owners.length ||
            owners.some((id) => !directoryIds.has(id)) ||
            (owners.length === 0) !== task.migration.owner_repair_required ||
            (task.migration.owner_repair_required && task.migration.state !== "needs_attention")
          )
            add(
              "assignment_owner_invalid",
              file.path,
              "Resolve owners or retain an explicitly acknowledged empty, repair-required, read-only owner state."
            );
          if (task.assignment.lifecycle === null)
            add(
              "assignment_lifecycle_unresolved",
              file.path,
              "Resolve required assignment lifecycle from trusted facts; acknowledgement cannot prove a legacy closed or contradictory Draft conversion."
            );
        }
        if (!original || !same(file, original))
          add(
            "assignment_owner_invalid",
            file.path,
            "Retain the exact approved 9.3 ownership and conversion projection."
          );
      }
      if (file.kind === "section") {
        const parsed = migrationSectionSchema.safeParse(data);
        if (!parsed.success)
          add(
            "section_evidence_invalid",
            file.path,
            "Restore strict schedule, usage, Apply evidence and provenance references."
          );
        else {
          const section = parsed.data;
          const assignment = assignmentPlan.assignments.find(
            (entry) =>
              entry.termCode === section.term_code &&
              entry.assignmentSlug === section.assignment_slug
          );
          if (
            file.path !==
              `terms/${section.term_code}/assignments/${section.assignment_slug}/sections/${section.section_id}.yml` ||
            !assignment?.sections.some((entry) => entry.sectionId === section.section_id)
          )
            add(
              "section_reference_invalid",
              file.path,
              "Use the exact canonical term/assignment/section reference."
            );
        }
        if (!original || !same(file, original))
          add(
            "section_evidence_invalid",
            file.path,
            "Retain exact section schedules and Apply evidence; partial/ambiguous history cannot become Complete or Not using."
          );
      }
      if (file.kind === "manifest" && (!original || !same(file, original)))
        add(
          "manifest_provenance_invalid",
          file.path,
          "Retain every repository ID, source anchor, template baseline and incomplete operation; remove only obsolete desired grader permissions."
        );
      if (file.kind === "metadata") {
        if (object(data)?.schema_version !== 1)
          add(
            "metadata_version_unsupported",
            file.path,
            "Only version 1 staged migration metadata is supported."
          );
        if (
          !migrationMetadataSchema.safeParse(data).success ||
          file.path !== MIGRATION_METADATA_PATH ||
          !original ||
          !same(file, original)
        )
          add(
            "preservation_invalid",
            file.path,
            "Retain complete source/review provenance, deferred inventory, explicit unknowns, classifications and exact audit originals."
          );
      }
    }
  }
  if (
    activeCount > 1 ||
    new Set(termCodes).size !== termCodes.length ||
    !same(termCodes.sort(), analysis.terms.map((term) => term.code).sort())
  )
    add(
      "term_lifecycle_invalid",
      "terms",
      "Validate all existing terms together, with unique identities and at most one Active term."
    );
  for (const expectedFile of expected.files)
    if (!files.has(expectedFile.path))
      add(
        "file_preservation_invalid",
        expectedFile.path,
        "Restore the complete candidate file set; publication cannot delete evidence or publish a partial subset."
      );
  if (candidate.files.some((file) => !expectedFiles.has(file.path)))
    add(
      "file_preservation_invalid",
      "files",
      "Remove unexpected additions/replacements and rebuild from the exact trusted artifacts."
    );
  if (
    !same(candidate.preservation, analysis.preservation) ||
    !same(candidate.audit.runtimeFiles, expected.audit.runtimeFiles) ||
    !same(candidate.audit.originalFiles, expected.audit.originalFiles)
  )
    add(
      "preservation_invalid",
      "audit",
      "Preserve source/runtime originals and complete Phase 9.5A evidence without relocation or false durability claims."
    );
  if (
    !same(candidate.audit.review, review) ||
    !same(candidate.audit.assignmentPlan, assignmentPlan) ||
    !same(candidate.audit.graderRemovalPlan, graderRemovalPlan)
  )
    add(
      "plan_invalid",
      "audit",
      "Use the exact completed review and trusted assignment/grader plans."
    );
};

/** The only publication-readiness decision layer. Pure and deterministic: no I/O,
 * callback, journal, clock, randomness or mutation capability. Never treats submitted
 * objects as retained authority. Production enablement intentionally remains closed. */
export const validateMigrationPublication = (
  context: MigrationPublicationContext,
  submitted: unknown
): MigrationPublicationResult => {
  const { artifacts, candidate: retained } = context;
  const { analysis, review, assignmentPlan, graderRemovalPlan: removal } = artifacts;
  const result: MigrationPublicationResultData = {
    kind: "schema-v2-migration-publication-validation",
    status: "blocked",
    internalReady: false,
    publicationReady: false,
    candidateFingerprint: migrationCandidateFingerprint(retained),
    provenance: {
      binding: context.binding,
      source: analysis.source,
      boundary: artifacts.boundary,
      inventoryId: removal.audit.accessReview.inventoryId,
      inventoryFingerprint: fingerprint(removal.audit.inventory),
      accessReviewId: fingerprint(removal.audit.accessReview),
      snapshotFingerprint: fingerprint(artifacts.snapshot)
    },
    blockers: [],
    deferredFindings: [],
    compatibility: {
      operationalSupport: "unproven",
      safeguards: "unproven",
      acknowledgement: "unproven",
      evidenceScope: "unavailable"
    },
    productionEnablement: { enabled: false, releaseAvailability: "unproven", blockers: [] }
  };
  const add: AddBlocker = (code, location, action) => {
    result.blockers.push({ code, location, action });
  };
  try {
    const request = object(submitted);
    if (
      !request ||
      !Object.hasOwn(request, "candidate") ||
      !Object.hasOwn(request, "binding") ||
      object(request.candidate) === null ||
      Object.keys(request).some((key) => key !== "candidate" && key !== "binding")
    )
      add(
        request && Object.hasOwn(request, "compatibility")
          ? "compatibility_untrusted"
          : "request_invalid",
        "request",
        "Submit only the candidate and binding assertions. Backend context and technical evidence cannot come from the renderer."
      );
    const candidate = (request?.candidate ?? retained) as MigrationCandidate;
    if (candidate !== retained)
      add(
        "candidate_untrusted",
        "candidate",
        "Retrieve the exact retained candidate through the current backend handoff; serialized copies confer no authority."
      );
    result.candidateFingerprint = migrationCandidateFingerprint(candidate);
    const expectedBinding = migrationPublicationBinding(artifacts, retained, context.binding);
    if (
      !publicationBindingSchema.safeParse(context.binding).success ||
      !same(context.binding, expectedBinding) ||
      !same(context.current, context.binding) ||
      !same(request?.binding, context.binding)
    )
      add(
        "source_binding_invalid",
        "binding",
        "Refresh trusted source/account/session/completion and review. Repository, organization, SHA, report, plans and candidate must match exactly."
      );
    if (!context.authorizedFaculty)
      add(
        "faculty_not_authorized",
        "faculty",
        "Revalidate the current authenticated faculty authorization through the trusted course boundary."
      );
    if (
      review.status !== "complete" ||
      review.errors.length > 0 ||
      review.missingDecisions.length > 0 ||
      !same(
        review.acknowledgements.map(stableJson).sort(),
        requiredMigrationAcknowledgements(analysis).map(stableJson).sort()
      )
    )
      add(
        "review_incomplete",
        "review",
        "Complete all required authorized human decisions for the exact retained analysis."
      );
    if (removal.audit.accessReview.status !== "complete")
      add(
        "grader_review_invalid",
        "grader-access",
        "Complete every required explicit grader-access disposition; membership never grants faculty authority."
      );
    if (
      assignmentPlan.status === "blocked" ||
      removal.status === "blocked" ||
      !removal.persistedCleanup
    )
      add(
        "plan_invalid",
        "plans",
        "Regenerate valid exact-source assignment and grader-removal plans after completing review."
      );
    if (
      analysis.organization.value !== "organization_reconciled" ||
      review.organizationCondition !== "organization_reconciled"
    )
      add(
        "organization_not_permitted",
        "organization",
        "Resolve immutable organization continuity/migration before publication; acknowledgement cannot establish it."
      );
    const expected = buildMigrationCandidate(artifacts);
    if (candidate.status === "blocked" || expected.status === "blocked")
      add(
        "candidate_blocked",
        "candidate",
        "Resolve candidate-generation safety failures and rebuild the complete snapshot."
      );
    if (migrationCandidateFingerprint(candidate) !== migrationCandidateFingerprint(expected))
      add(
        "candidate_tampered",
        "candidate",
        "Rebuild the candidate from exact trusted source, human review and plans; modified projections cannot publish."
      );
    validateFiles(candidate.files, add);
    validateFiles(candidate.audit.originalFiles, add);
    validateFiles(candidate.audit.runtimeFiles, add);
    validateSnapshot(context, candidate, expected, add);
    for (const finding of assignmentPlan.findings) {
      const location = [finding.termCode, finding.assignmentSlug, finding.sectionId]
        .filter(Boolean)
        .join("/");
      const blocking: Partial<Record<typeof finding.code, MigrationPublicationBlockerCode>> = {
        owner_unresolved: "assignment_owner_invalid",
        section_scope_conflict: "section_reference_invalid",
        repository_identity_unresolved: "manifest_provenance_invalid",
        legacy_closed_unresolved: "assignment_lifecycle_unresolved",
        draft_activity_conflict: "assignment_lifecycle_unresolved"
      };
      const code = blocking[finding.code];
      if (code) add(code, location, finding.message);
      else
        result.deferredFindings.push({
          ...finding,
          location,
          phase: "9",
          classification: "needs_attention"
        });
    }
    for (const path of Object.keys(artifacts.snapshot.sourceFiles))
      if (/^terms\/[^/]+\/activation-recovery\.yml$/u.test(path))
        add(
          "term_lifecycle_invalid",
          path,
          "Resolve the existing activation recovery checkpoint before schema migration; migration review cannot clear or reinterpret irreversible recovery history."
        );
    const manifests = [
      ...analysis.assignments.flatMap((entry) => entry.manifests),
      ...analysis.unassignedManifests
    ];
    for (const manifest of manifests) {
      const content = (
        manifest.provenance === "source"
          ? artifacts.snapshot.sourceFiles
          : artifacts.snapshot.runtime.files
      )[manifest.location];
      if (content !== undefined) {
        let raw: unknown;
        try {
          raw = parse(content) as unknown;
        } catch {
          /* Safely preserved damaged evidence remains Needs attention. */
        }
        const parsed = migrationManifestSchema.safeParse(raw);
        if (manifest.state === "loaded" && manifest.schemaVersion === 1 && parsed.success) {
          const record = parsed.data;
          const assignment = analysis.assignments.find(
            (entry) =>
              `terms/${entry.termCode}/manifests/${entry.slug}/manifest.yml` === manifest.location
          );
          if (
            assignment &&
            (record.assignment.term_code !== assignment.termCode ||
              record.assignment.assignment_slug !== assignment.slug ||
              record.assignment.course_code !==
                analysis.courseConfigurationEvidence?.value.course.code)
          )
            add(
              "manifest_provenance_invalid",
              manifest.location,
              "Resolve the manifest's conflicting course, term or assignment identity before publication."
            );
          for (const anchor of record.source.source_files)
            if (!migrationPathSchema.safeParse(anchor.path).success)
              add(
                "unsafe_path",
                manifest.location,
                "Manifest source anchors must use canonical safe relative paths."
              );
          for (const repository of record.repositories) {
            const repo = repository.repository;
            if (
              !isId(repo.id) ||
              repo.full_name.toLowerCase() !== `${repo.owner}/${repo.name}`.toLowerCase()
            )
              add(
                "manifest_provenance_invalid",
                manifest.location,
                "Resolve invalid immutable repository IDs or contradictory owner/name/full-name identity from trusted evidence."
              );
            if (
              repo.created_from_template &&
              (repo.template_sync_baseline_status === "baseline_required" ||
                !repo.template_repository ||
                !isSha(repo.template_commit_sha ?? "") ||
                !isSha(repo.student_default_branch_commit_sha ?? ""))
            )
              result.deferredFindings.push({
                code: "template_baseline_unproven",
                location: `${manifest.provenance}:${manifest.location}#${repo.full_name}`,
                phase: "9",
                classification: "needs_attention",
                message:
                  "Preserved template provenance lacks a verified complete baseline; propagation must remain blocked until repaired."
              });
          }
          if (record.template && !isSha(record.template.commit_sha ?? ""))
            result.deferredFindings.push({
              code: "template_commit_unproven",
              location: `${manifest.provenance}:${manifest.location}`,
              phase: "9",
              classification: "needs_attention",
              message:
                "Preserved template commit is absent/invalid; no safe template adoption or propagation is established."
            });
        }
        const version = object(raw)?.schema_version;
        if (version !== undefined && version !== 1 && version !== 2)
          add(
            "schema_unsupported",
            manifest.location,
            "Unsupported manifest versions cannot supply migration evidence."
          );
      }
    }
    const repositories = new Map<number, string>();
    for (const assignment of analysis.assignments)
      for (const manifest of assignment.manifests) {
        const manifestIds = manifest.repositories.map((repo) => repo.repositoryId);
        if (new Set(manifestIds).size !== manifestIds.length)
          add(
            "manifest_provenance_invalid",
            manifest.location,
            "Resolve duplicate repository records inside the manifest; preserved duplicates cannot establish a unique identity mapping."
          );
        for (const repo of manifest.repositories) {
          const identity = stableJson([
            assignment.termCode,
            assignment.slug,
            repo.sectionId,
            repo.studentId,
            repo.repositoryName
          ]);
          if (repo.repositoryId !== null) {
            const previous = repositories.get(repo.repositoryId);
            if (previous && previous !== identity)
              add(
                "manifest_provenance_invalid",
                manifest.location,
                "One immutable repository ID cannot identify conflicting assignment/section/target mappings."
              );
            repositories.set(repo.repositoryId, identity);
          }
        }
      }
    const preservation = analysis.preservation;
    result.deferredFindings.push({
      code: "preservation_completeness_unknown",
      location: "preservation",
      phase: "9",
      classification: "needs_attention",
      message:
        "Preserved source and machine-local evidence do not prove completeness across faculty machines."
    });
    if (analysis.runtimeCoverage === "unavailable")
      result.deferredFindings.push({
        code: "runtime_evidence_unavailable",
        location: "runtime",
        phase: "9",
        classification: "needs_attention",
        message:
          "Runtime evidence is unavailable; the remote v1 checkpoint is not a backup of machine-local grading records."
      });
    for (const artifact of preservation.artifacts)
      if (artifact.classification === "unresolved")
        result.deferredFindings.push({
          code: "artifact_preserved_unverified",
          location: `${artifact.provenance}:${artifact.location}`,
          phase: "14",
          classification: "needs_attention",
          message:
            "Original artifact bytes are preserved without establishing verified publication or remotely durable grading."
        });
    for (const manifest of manifests)
      if (manifest.state !== "missing" && manifest.applyState !== "complete_evidence")
        result.deferredFindings.push({
          code: "manifest_preserved_unresolved",
          location: `${manifest.provenance}:${manifest.location}`,
          phase: "9",
          classification: "needs_attention",
          message:
            "Manifest evidence, repository/template provenance and incomplete outcomes are preserved; unresolved Apply never grants Complete evidence or destructive reconciliation authority."
        });
    result.deferredFindings.push(
      {
        code: "student_identity_deferred",
        location: "students",
        phase: "13",
        classification: "deferred",
        message:
          "Student usernames and all immutable ID observations are preservation evidence only; canonical identity and replacement/transfer workflows remain Phase 13."
      },
      {
        code: "grading_durability_deferred",
        location: "grading",
        phase: "14",
        classification: "deferred",
        message:
          "Original grading, selected commits, decisions, snapshots and publication evidence remain in place; reachability, remote durability and cross-machine completeness are unknown."
      },
      {
        code: "role_history_unknown",
        location: "faculty",
        phase: "9",
        classification: "needs_attention",
        message: "Earlier role history is unavailable; only proven current roles are published."
      }
    );
    for (const student of preservation.students)
      if (student.identityState !== "observed")
        result.deferredFindings.push({
          code: "student_identity_unresolved",
          location: student.location,
          phase: "13",
          classification: "needs_attention",
          message: `Preserved ${student.studentId}: immutable student identity is ${student.identityState}.`
        });
    for (const grading of preservation.grading)
      result.deferredFindings.push({
        code: "grading_preserved_unverified",
        location: `${grading.provenance}:${grading.location}`,
        phase: "14",
        classification: "needs_attention",
        message: `Preserved ${grading.state} grading with ${grading.sectionPlacement} placement; commit reachability/publication verification remain unknown.`
      });
    for (const comments of preservation.comments)
      result.deferredFindings.push({
        code: "comment_history_unknown",
        location: `${comments.provenance}:${comments.location}`,
        phase: "later",
        classification: "needs_attention",
        message: `Preserved ${comments.state} reusable-comment evidence and applied snapshots; ownership/history are unknown and ownership-controlled edits remain blocked.`
      });
    for (const finding of removal.findings)
      result.deferredFindings.push({
        code: finding.code,
        location: "grader-reconciliation",
        phase: "9",
        classification: "needs_attention",
        message: finding.message
      });
    validateMigrationCompatibility(context, result);
  } catch {
    add(
      "snapshot_invalid",
      "candidate",
      "Restore complete supported trusted artifacts. Malformed or unknown evidence fails closed."
    );
    if (result.productionEnablement.blockers.length === 0)
      result.productionEnablement.blockers.push({
        code: "production_evidence_unavailable",
        location: "production",
        action:
          "Production migration requires independent trusted compatibility, acknowledgement and release evidence."
      });
  }
  result.blockers = [
    ...new Map(result.blockers.map((entry) => [stableJson(entry), entry])).values()
  ].sort((a, b) => compare(stableJson(a), stableJson(b)));
  result.deferredFindings.sort((a, b) => compare(stableJson(a), stableJson(b)));
  result.internalReady = result.blockers.length === 0;
  result.status = result.internalReady ? "implementation_ready" : "blocked";
  if (!result.internalReady)
    result.productionEnablement.blockers.push({
      code: "publication_facts_unproven",
      location: "candidate",
      action: "Resolve every publication blocker and revalidate the exact candidate."
    });
  result.productionEnablement.blockers.sort((a, b) => compare(stableJson(a), stableJson(b)));
  return freeze(structuredClone(result));
};
