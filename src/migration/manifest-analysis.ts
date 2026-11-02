import type { RawAssignmentConfig, RawCourseConfigV1 } from "../config/config-models.js";
import { createInputFingerprint } from "../config/source-fingerprint.js";
import { parseManifest, type ManifestLoadResult } from "../manifest/manifest-loader.js";
import type { RosterRecord } from "../roster/roster-diff.js";
import type {
  ApplyEvidenceState,
  GraderMigrationEvidence,
  ManifestMigrationEvidence,
  MigrationSnapshot
} from "./migration-models.js";
import { compare, isId, sortedUnique, textHash } from "./migration-evidence.js";

export const analyzeManifestEvidence = (request: {
  input: MigrationSnapshot;
  termCode: string;
  courseCode: string;
  courseGithub: RawCourseConfigV1["github"];
  assignment: RawAssignmentConfig;
  roster: readonly RosterRecord[];
  rosterComplete: boolean;
  expectedSourcePaths: string[];
  provenance: "source" | "runtime";
  graderEvidence: GraderMigrationEvidence[];
}): ManifestMigrationEvidence => {
  const { input, termCode, courseCode, assignment, provenance, graderEvidence } = request;
  const location = `terms/${termCode}/manifests/${assignment.assignment.slug}/manifest.yml`;
  const content = (provenance === "source" ? input.sourceFiles : input.runtime.files)[location];
  const report: ManifestMigrationEvidence = {
    provenance,
    location,
    contentFingerprint: content === undefined ? null : textHash(content),
    state: content === undefined ? "missing" : "loaded",
    classification: "derived",
    schemaVersion: null,
    applyState: "not_observed",
    sectionStates: [],
    repositories: [],
    targets: [],
    operations: [],
    studentMappings: [],
    diagnostics: [],
    provesPriorActivity: false
  };
  const sections = sortedUnique(assignment.sections);
  if (content === undefined) {
    report.sectionStates = sections.map((sectionId) => ({ sectionId, state: "not_observed" }));
    return report;
  }
  let parsed: ManifestLoadResult;
  try {
    parsed = parseManifest(content, `${provenance}:${location}`);
  } catch {
    parsed = {
      status: "failure",
      warnings: [],
      errors: [
        {
          code: "unreadable_manifest_yaml",
          severity: "error",
          message: "Manifest YAML could not be parsed safely."
        }
      ]
    };
  }
  if (parsed.status !== "loaded") {
    report.state = "invalid";
    report.classification = "unresolved";
    report.applyState = "ambiguous";
    report.diagnostics = parsed.errors.map((error) => `${error.code}: ${error.message}`);
    report.sectionStates = sections.map((sectionId) => ({ sectionId, state: "ambiguous" }));
    return report;
  }
  const manifest = parsed.manifest;
  report.schemaVersion = manifest.schemaVersion;
  report.repositories = manifest.repositories.map((record) => ({
    studentId: record.studentId,
    githubUsername: record.githubUsername,
    sectionId: record.section,
    repositoryId: record.repository.id ?? null,
    repositoryName: record.repository.fullName,
    lifecycle: record.lifecycle.status
  }));
  report.targets = [...(manifest.targets ?? [])]
    .sort((a, b) => compare(a.targetId, b.targetId))
    .map((target) => ({
      targetId: target.targetId,
      sectionIds: sortedUnique(target.sectionIds),
      studentIds: sortedUnique(target.studentIds),
      repositoryName: target.repositoryName,
      lifecycle: target.lifecycleStatus ?? null
    }));
  report.operations = manifest.operationHistory.map((operation) => ({
    command: operation.command,
    status: operation.status,
    completed: operation.completedAt !== undefined,
    startedAt: operation.startedAt,
    completedAt: operation.completedAt ?? null
  }));
  report.studentMappings = [...(manifest.studentMappings ?? [])]
    .sort((a, b) => compare(a.studentId, b.studentId))
    .map((mapping) => ({
      studentId: mapping.studentId,
      githubUsername: mapping.githubUsername,
      targetId: mapping.targetId,
      repositoryName: mapping.repositoryName
    }));
  for (const record of manifest.repositories)
    if (record.permissions.graderTeam) {
      graderEvidence.push({
        location: `${location}#${record.repository.fullName}`,
        provenance: `manifest-${provenance}`,
        team: record.permissions.graderTeam.teamSlug,
        permission: record.permissions.graderTeam.permission,
        classification: "derived"
      });
    }
  const diagnostics = [
    ...manifest.warnings,
    ...manifest.errors,
    ...manifest.operationHistory.flatMap((operation) => [
      ...operation.warnings,
      ...operation.errors
    ]),
    ...manifest.repositories.flatMap((record) => [...record.warnings, ...record.errors]),
    ...(manifest.targets?.flatMap((target) => target.diagnostics) ?? [])
  ];
  report.diagnostics = diagnostics.map((item) => `${item.code}: ${item.message}`);
  const wrongBinding =
    manifest.schemaVersion === 1 &&
    (manifest.assignment.termCode !== termCode ||
      manifest.assignment.courseCode !== courseCode ||
      manifest.assignment.assignmentSlug !== assignment.assignment.slug);
  const sourceMismatch =
    manifest.schemaVersion === 1 &&
    (manifest.source.sourceFiles.length === 0 ||
      request.expectedSourcePaths.some(
        (file) => !manifest.source.sourceFiles.some((anchor) => anchor.path === file)
      ) ||
      createInputFingerprint(manifest.source.sourceFiles) !== manifest.source.inputFingerprint ||
      manifest.source.sourceFiles.some((file) => {
        const source = input.sourceFiles[file.path];
        return source === undefined || textHash(source) !== file.sha256;
      }));
  const unknownSections =
    manifest.repositories.some((record) => !sections.includes(record.section)) ||
    (manifest.targets?.some((target) => target.sectionIds.some((id) => !sections.includes(id))) ??
      false);
  const failed =
    manifest.operationHistory.some(
      (operation) => operation.status !== "success" || !operation.completedAt
    ) ||
    manifest.repositories.some(
      (record) =>
        record.lifecycle.status === "error" ||
        record.lifecycle.status === "missing" ||
        (["created", "active"].includes(record.lifecycle.status) &&
          (record.lifecycle.repositoryArchived || record.lifecycle.studentAccessRemoved)) ||
        (record.lifecycle.status === "archived" && !record.lifecycle.repositoryArchived) ||
        (record.lifecycle.status === "access_removed" && !record.lifecycle.studentAccessRemoved)
    ) ||
    diagnostics.some((item) => item.severity === "error");
  const repositoryIds = manifest.repositories.map((record) => record.repository.id);
  const duplicateRepositories = new Set(repositoryIds).size !== repositoryIds.length;
  const successfulApply = manifest.operationHistory.some(
    (operation) =>
      operation.command === "apply" &&
      operation.status === "success" &&
      operation.completedAt !== undefined
  );
  // Group manifests currently lack immutable repository IDs, operation history and source
  // anchors. Keep targets visible but defer proving their section-specific conversion.
  const ambiguous =
    duplicateRepositories ||
    wrongBinding ||
    sourceMismatch ||
    unknownSections ||
    !request.rosterComplete ||
    manifest.schemaVersion === 2 ||
    assignment.repository_mode === "group" ||
    diagnostics.some((item) => item.severity === "warning");
  if (wrongBinding)
    report.diagnostics.push(
      "Manifest assignment identity disagrees with the source configuration."
    );
  if (sourceMismatch)
    report.diagnostics.push("Manifest input anchors do not match the analyzed source snapshot.");
  if (unknownSections) report.diagnostics.push("Manifest contains unresolved section targets.");
  report.sectionStates = sections.map((sectionId) => {
    const records = manifest.repositories.filter((record) => record.section === sectionId);
    const expected = request.roster.filter(
      (student) => student.section === sectionId && student.status === "active"
    );
    const matched = expected.every(
      (student) =>
        records.filter(
          (record) =>
            record.studentId === student.studentId &&
            record.githubUsername === student.githubUsername
        ).length === 1
    );
    const extras = records.some(
      (record) =>
        !request.roster.some(
          (student) =>
            student.section === sectionId &&
            student.studentId === record.studentId &&
            student.githubUsername === record.githubUsername
        )
    );
    const ids = records.map((record) => record.repository.id);
    const complete =
      records.length > 0 &&
      expected.length > 0 &&
      matched &&
      !extras &&
      ids.every((id) => id !== undefined && Number.isSafeInteger(id) && id > 0) &&
      new Set(ids).size === ids.length &&
      successfulApply &&
      records.every(
        (record) =>
          record.permissions.student !== undefined &&
          !record.permissions.student.pendingInvite &&
          record.permissions.student.username === record.githubUsername &&
          record.permissions.student.permission === request.courseGithub.student_permission &&
          record.permissions.facultyTeam?.teamSlug === request.courseGithub.faculty_team &&
          record.permissions.facultyTeam.permission === request.courseGithub.faculty_permission
      );
    const state: ApplyEvidenceState = failed
      ? "partial_incomplete"
      : ambiguous
        ? "ambiguous"
        : complete
          ? "complete_evidence"
          : "partial_incomplete";
    return { sectionId, state };
  });
  report.applyState = failed
    ? "partial_incomplete"
    : ambiguous
      ? "ambiguous"
      : report.sectionStates.every((section) => section.state === "complete_evidence")
        ? "complete_evidence"
        : "partial_incomplete";
  report.classification =
    report.applyState === "complete_evidence" ? "derived" : "requires_confirmation";
  report.provesPriorActivity =
    provenance === "source" &&
    !wrongBinding &&
    !unknownSections &&
    manifest.repositories.some(
      (record) =>
        isId(record.repository.id) && !["error", "missing"].includes(record.lifecycle.status)
    );
  return report;
};
