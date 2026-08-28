import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { Manifest, ManifestRepositoryRecord } from "./manifest-models.js";

/**
 * Repository-centric compatibility view over the v1 per-student manifest.
 * New group-aware persistence will consume this model; current commands retain
 * the v1 manifest on disk so existing course folders require no migration.
 */
export type RepositoryTargetMode = "individual" | "group";

export interface RepositoryTarget {
  readonly targetId: string;
  readonly mode: RepositoryTargetMode;
  readonly repositoryName: string;
  readonly repositoryUrl: string | null;
  readonly cloneUrl?: string | null;
  readonly groupId?: string;
  readonly sectionIds: readonly string[];
  readonly studentIds: readonly string[];
  readonly githubUsernames: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface StudentRepositoryMapping {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly targetId: string;
  readonly repositoryName: string;
  readonly repositoryUrl: string | null;
  readonly cloneUrl?: string | null;
}

export interface NormalizedManifestRepositories {
  readonly targets: readonly RepositoryTarget[];
  readonly studentMappings: readonly StudentRepositoryMapping[];
}

const toTarget = (record: ManifestRepositoryRecord): RepositoryTarget => ({
  targetId: record.studentId,
  mode: "individual",
  repositoryName: record.repository.name,
  repositoryUrl: record.repository.htmlUrl ?? null,
  sectionIds: [record.section],
  studentIds: [record.studentId],
  githubUsernames: [record.githubUsername],
  diagnostics: [...record.warnings, ...record.errors]
});

const toMapping = (record: ManifestRepositoryRecord): StudentRepositoryMapping => ({
  studentId: record.studentId,
  githubUsername: record.githubUsername,
  targetId: record.studentId,
  repositoryName: record.repository.name,
  repositoryUrl: record.repository.htmlUrl ?? null
});

export const normalizeManifestRepositories = (
  manifest: Manifest
): NormalizedManifestRepositories => ({
  targets:
    manifest.schemaVersion === 2
      ? (manifest.targets ?? []).map((target) => ({
          targetId: target.targetId,
          mode: target.mode,
          repositoryName: target.repositoryName,
          repositoryUrl: target.htmlUrl ?? null,
          ...(target.cloneUrl === undefined ? {} : { cloneUrl: target.cloneUrl }),
          ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
          sectionIds: target.sectionIds,
          studentIds: target.studentIds,
          githubUsernames: target.githubUsernames,
          diagnostics: target.diagnostics
        }))
      : manifest.repositories.map(toTarget),
  studentMappings:
    manifest.schemaVersion === 2
      ? (manifest.studentMappings ?? []).map((mapping) => ({
          studentId: mapping.studentId,
          githubUsername: mapping.githubUsername,
          targetId: mapping.targetId,
          repositoryName: mapping.repositoryName,
          repositoryUrl: mapping.htmlUrl ?? null,
          ...(mapping.cloneUrl === undefined ? {} : { cloneUrl: mapping.cloneUrl })
        }))
      : manifest.repositories.map(toMapping)
});

export const findStudentRepositoryMapping = (
  normalized: NormalizedManifestRepositories,
  studentId: string
): StudentRepositoryMapping | undefined =>
  normalized.studentMappings.find((mapping) => mapping.studentId === studentId);
