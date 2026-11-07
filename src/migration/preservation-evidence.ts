import { createHash } from "node:crypto";
import { gradingStateSchema } from "../grading/grading-state.js";
import { commentLibrarySchema } from "../grading/comment-library.js";
import type { CourseMigrationAnalysisData, MigrationSnapshot } from "./migration-models.js";
import type { PreservationInventory, PreservedArtifact } from "./preservation-models.js";
import {
  compare,
  isId,
  isSha,
  isSafeRelativePath,
  fact,
  sortedUnique,
  stableJson
} from "./migration-evidence.js";

export const emptyPreservationInventory = (): PreservationInventory => ({
  boundary: "staged-phase-9",
  completeness: "unknown",
  preservation: "originals-retained-in-place",
  students: [],
  studentObservations: [],
  grading: [],
  comments: [],
  artifacts: [],
  deferredWork: [
    "Phase 13 canonical student identity and account-change workflows",
    "Phase 14 canonical grading placement, persistence and publication history",
    "Reusable-comment ownership/history repair before ownership-controlled edits"
  ]
});
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Pure inventory. No filesystem, provider, identity resolution or mutation capability. */
export const inventoryPreservationEvidence = (
  input: MigrationSnapshot,
  report: CourseMigrationAnalysisData
): void => {
  const inventory = report.preservation;
  inventory.studentObservations = structuredClone([...(input.studentObservations ?? [])]).sort(
    (a, b) => compare(stableJson(a), stableJson(b))
  );
  for (const student of inventory.students) {
    student.observations = inventory.studentObservations.filter(
      (entry) => entry.termCode === student.termCode && entry.studentId === student.studentId
    );
    student.identityState =
      student.observations.length === 0
        ? "unknown"
        : student.observations.some(
              (entry) => !isId(entry.githubUserId) || !entry.githubLogin || !entry.reference
            ) || new Set(student.observations.map((entry) => entry.githubUserId)).size > 1
          ? "ambiguous"
          : "observed";
    if (student.identityState === "ambiguous")
      report.issues.push({
        code: "student_identity_observations_ambiguous",
        location: student.location,
        classification: "unresolved",
        message:
          "Immutable student ID observations conflict or are invalid; preserved for Phase 13 without resolving identity or authority."
      });
  }
  const attention = (code: string, location: string, message: string) => {
    report.issues.push({ code, location, message, classification: "unresolved" });
  };
  for (const provenance of ["source", "runtime"] as const) {
    const files = provenance === "source" ? input.sourceFiles : input.runtime.files;
    const byteFiles = provenance === "source" ? input.sourceBytesBase64 : input.runtime.bytesBase64;
    const artifact = (location: string): PreservedArtifact => {
      const text = files[location];
      const bytes =
        text === undefined
          ? null
          : Buffer.from(byteFiles?.[location] ?? Buffer.from(text).toString("base64"), "base64");
      if (
        !isSafeRelativePath(location) ||
        (bytes !== null &&
          (bytes.toString("utf8") !== text ||
            (byteFiles?.[location] !== undefined &&
              byteFiles[location] !== bytes.toString("base64"))))
      )
        report.issues.push({
          code: "preservation_integrity_failure",
          location: `${provenance}:${location}`,
          classification: "blocking",
          message:
            "Evidence path or original bytes disagree with the inventoried source; preservation cannot be established."
        });
      return {
        provenance,
        location,
        originalText: text ?? null,
        originalBytesBase64: bytes?.toString("base64") ?? null,
        contentFingerprint:
          bytes === null ? null : createHash("sha256").update(bytes).digest("hex"),
        classification: "derived"
      };
    };
    const libraryPath = ".graider/grading/comments.json";
    const libraryText = files[libraryPath];
    const library = commentLibrarySchema.safeParse(parseJson(libraryText ?? ""));
    inventory.comments.push({
      ...artifact(libraryPath),
      classification: "unresolved",
      state: libraryText === undefined ? "missing" : library.success ? "loaded" : "invalid",
      library: library.success ? library.data : null,
      ownership: "unknown",
      history: "unknown"
    });
    if (libraryText !== undefined)
      attention(
        "comment_ownership_history_unknown",
        `${provenance}:${libraryPath}`,
        "Library bytes preserved; ownership/history unknown. Invalid entries require repair; no owner is inferred."
      );
    for (const file of Object.keys(files).sort(compare)) {
      if (file === libraryPath) {
        /* The library has its own independent inventory. */
      } else if (file.startsWith(".graider/grading/") || /\/(?:grading|reports)\//u.test(file)) {
        const raw = artifact(file);
        const match = /^\.graider\/grading\/([^/]+)\/([^/]+)\/state\/([^/]+)\.json$/u.exec(file);
        if (!match) inventory.artifacts.push(raw);
        else {
          const termCode = match[1] ?? "";
          const assignmentSlug = match[2] ?? "";
          const json = parseJson(files[file] ?? "");
          const parsed = gradingStateSchema.safeParse(json);
          const fields = object(json);
          const targetId = typeof fields.studentId === "string" ? fields.studentId : null;
          const assignment = report.assignments.find(
            (entry) => entry.termCode === termCode && entry.slug === assignmentSlug
          );
          const group = assignment?.configurationEvidence.value.repository_mode === "group";
          const groupTargets = (assignment?.manifests ?? []).flatMap((manifest) =>
            manifest.targets.filter((target) => target.targetId === targetId)
          );
          const incompleteGroup =
            group &&
            (groupTargets.length === 0 ||
              groupTargets.some(
                (target) =>
                  target.studentIds.length === 0 ||
                  target.studentIds.some(
                    (id) =>
                      !inventory.students.some(
                        (student) => student.termCode === termCode && student.studentId === id
                      )
                  )
              ) ||
              new Set(groupTargets.map((target) => stableJson(target.studentIds))).size > 1);
          const placements: Array<{ section: string; reference: string }> = [];
          if (targetId !== null) {
            for (const student of inventory.students.filter(
              (entry) => entry.termCode === termCode && entry.studentId === targetId
            ))
              placements.push({
                section: student.sectionId,
                reference: `source:${student.location}`
              });
            for (const manifest of assignment?.manifests ?? []) {
              for (const repository of manifest.repositories.filter(
                (entry) => entry.studentId === targetId
              ))
                placements.push({
                  section: repository.sectionId,
                  reference: `${manifest.provenance}:${manifest.location}`
                });
              for (const target of manifest.targets.filter(
                (entry) => entry.targetId === targetId
              )) {
                for (const section of target.sectionIds)
                  placements.push({
                    section,
                    reference: `${manifest.provenance}:${manifest.location}`
                  });
                for (const id of target.studentIds)
                  for (const student of inventory.students.filter(
                    (entry) => entry.termCode === termCode && entry.studentId === id
                  ))
                    placements.push({
                      section: student.sectionId,
                      reference: `source:${student.location}`
                    });
              }
            }
          }
          const sectionIds = sortedUnique(placements.map((entry) => entry.section));
          const sectionsValid = sectionIds.every((section) =>
            assignment?.sections.includes(section)
          );
          const sectionPlacement =
            sectionIds.length === 0
              ? "unmapped"
              : sectionIds.length > 1
                ? group
                  ? "cross_section"
                  : "ambiguous"
                : incompleteGroup
                  ? "ambiguous"
                  : sectionsValid
                    ? "exact"
                    : "unmapped";
          const selectedCommit =
            typeof fields.submissionCommitSha === "string" ? fields.submissionCommitSha : null;
          const valid =
            parsed.success &&
            selectedCommit !== null &&
            isSha(selectedCommit) &&
            targetId === match[3];
          const unresolved =
            !valid || sectionPlacement !== "exact" || fields.status === "published";
          inventory.grading.push({
            ...raw,
            classification: unresolved ? "unresolved" : "derived",
            termCode,
            assignmentSlug,
            state: valid ? "loaded" : "invalid",
            targetId,
            targetKind: assignment === undefined ? "unknown" : group ? "group" : "individual",
            sectionPlacement,
            sectionIds,
            placementEvidence: sortedUnique(placements.map((entry) => entry.reference)),
            selectedCommit,
            commitReachability: "unknown",
            recordedStatus: typeof fields.status === "string" ? fields.status : null,
            publicationVerification: "unknown",
            decisions: parsed.success ? parsed.data : null,
            appliedSnapshots: Array.isArray(fields.appliedComments)
              ? structuredClone(fields.appliedComments)
              : []
          });
          if (
            report.validatedMigrationFacts &&
            provenance === "source" &&
            valid &&
            sectionPlacement === "exact" &&
            (parsed.data.status !== "not_started" ||
              parsed.data.appliedComments.length > 0 ||
              parsed.data.manualAdjustments.length > 0)
          ) {
            const term = report.terms.find((entry) => entry.code === termCode);
            if (term)
              term.lifecycle.hasEverBeenActive = fact(
                "derived",
                true,
                ...term.lifecycle.hasEverBeenActive.evidence,
                `source-grading-activity:${file}`
              );
          }
          if (unresolved)
            attention(
              "grading_preservation_needs_attention",
              `${provenance}:${file}`,
              "Original bytes and snapshots retained; damaged, unmapped or ambiguous grading/publication evidence requires later review. No destination or authority inferred."
            );
        }
      }
    }
  }
  for (const record of inventory.grading) {
    const conflicting = inventory.grading.some(
      (other) =>
        other !== record &&
        other.location === record.location &&
        other.contentFingerprint !== record.contentFingerprint
    );
    if (conflicting) {
      record.classification = "unresolved";
      attention(
        "grading_copies_conflict",
        `${record.provenance}:${record.location}`,
        "Source and runtime grading copies disagree; both originals are preserved and neither is selected as authoritative."
      );
    }
  }
};
