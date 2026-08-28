import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { createConfigDiagnostic, DiagnosticCode } from "../diagnostics/error-catalog.js";
import {
  normalizeManifestRepositories,
  type RepositoryTarget
} from "../manifest/repository-targets.js";
import type { Manifest } from "../manifest/manifest-models.js";
import type { RosterStudent } from "../roster/roster-models.js";

/** A manifest-normalized repository identity used by grading consumers. */
export interface GradingRepositoryTarget {
  readonly repositoryMode: "individual" | "group";
  readonly targetId: string;
  readonly groupId?: string;
  readonly owner: string;
  readonly repositoryName: string;
  readonly fullName: string;
  readonly htmlUrl: string | null;
  readonly cloneUrl?: string | null;
  readonly sectionIds: readonly string[];
  readonly studentIds: readonly string[];
  readonly githubUsernames: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface NormalizedGradingTargets {
  readonly repositoryMode: "individual" | "group";
  readonly targets: readonly GradingRepositoryTarget[];
  readonly diagnostics: readonly Diagnostic[];
}

const createMissingIdentityDiagnostic = (target: RepositoryTarget): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.StudentRepositoryMissing,
    "Manifest repository target does not have a repository identity.",
    {
      targetId: target.targetId,
      ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
      repositoryName: target.repositoryName
    }
  );

/**
 * Normalizes both manifest versions into repository targets. v2 intentionally
 * stores repository names rather than an owner; grading operations use the
 * configured course organization, which is also the Apply owner.
 */
export const normalizeGradingTargets = (
  manifest: Manifest,
  organization: string
): NormalizedGradingTargets => {
  const normalized = normalizeManifestRepositories(manifest);
  const diagnostics: Diagnostic[] = [];
  const targets = normalized.targets.flatMap((target) => {
    if (target.repositoryName.length === 0) {
      diagnostics.push(createMissingIdentityDiagnostic(target));
      return [];
    }

    return [
      {
        repositoryMode: target.mode,
        targetId: target.targetId,
        ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
        owner: organization,
        repositoryName: target.repositoryName,
        fullName: `${organization}/${target.repositoryName}`,
        htmlUrl: target.repositoryUrl,
        ...(target.cloneUrl === undefined ? {} : { cloneUrl: target.cloneUrl }),
        sectionIds: target.sectionIds,
        studentIds: target.studentIds,
        githubUsernames: target.githubUsernames,
        diagnostics: target.diagnostics
      }
    ];
  });

  return {
    repositoryMode: manifest.repositoryMode ?? "individual",
    targets,
    diagnostics
  };
};

/** Select unique repository targets for a student selection. */
export const selectGradingTargets = (
  normalized: NormalizedGradingTargets,
  students: readonly RosterStudent[]
): readonly GradingRepositoryTarget[] => {
  const selectedStudentIds = new Set(students.map((student) => student.studentId));
  return normalized.targets.filter((target) =>
    target.studentIds.some((studentId) => selectedStudentIds.has(studentId))
  );
};

export const findGradingTargetForStudent = (
  normalized: NormalizedGradingTargets,
  student: RosterStudent
): GradingRepositoryTarget | undefined =>
  normalized.targets.find(
    (target) =>
      target.studentIds.some((studentId) => studentId === student.studentId) &&
      target.sectionIds.some((section) => section === student.section)
  );
