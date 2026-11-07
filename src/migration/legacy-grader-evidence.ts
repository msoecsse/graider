import type { CourseMigrationAnalysis } from "./migration-models.js";
import type {
  LegacyGraderInventoryData,
  LegacyGraderFindingCode,
  LegacyRepositoryEvidence
} from "./legacy-grader-models.js";
import { compare, stableJson } from "./migration-evidence.js";
import { positiveId } from "../github/repository-team-permission-boundary.js";

export const addLegacyFinding = (
  result: LegacyGraderInventoryData,
  code: LegacyGraderFindingCode,
  location: string,
  classification: "unresolved" | "blocking" = "unresolved"
): void => {
  result.findings.push({ code, classification, location });
};

/** Preserve all provenance. Runtime records never introduce a repository into remote scope. */
export const inventoryLegacyRepositoryEvidence = (
  analysis: CourseMigrationAnalysis,
  result: LegacyGraderInventoryData
): void => {
  const evidence: LegacyRepositoryEvidence[] = [
    {
      provenance: "course-config",
      location: "course.yml",
      repositoryId: analysis.source.repositoryId,
      repositoryName: analysis.source.repositoryName
    }
  ];
  const manifests = [
    ...analysis.assignments.flatMap((a) => a.manifests),
    ...analysis.unassignedManifests
  ];
  for (const manifest of manifests) {
    if (
      manifest.state === "invalid" ||
      (manifest.state === "loaded" && manifest.classification !== "derived")
    )
      addLegacyFinding(
        result,
        "manifest_evidence_incomplete",
        `${manifest.provenance}:${manifest.location}`
      );
    for (const repository of manifest.repositories)
      evidence.push({
        provenance: manifest.provenance,
        location: manifest.location,
        repositoryId: repository.repositoryId,
        repositoryName: repository.repositoryName
      });
    for (const target of manifest.targets)
      if (!manifest.repositories.some((r) => r.repositoryName === target.repositoryName))
        evidence.push({
          provenance: manifest.provenance,
          location: manifest.location,
          repositoryId: null,
          repositoryName: target.repositoryName
        });
  }
  result.repositoryEvidence = evidence.sort((a, b) => compare(stableJson(a), stableJson(b)));
  const loadedSourceLocations = new Set(
    manifests
      .filter((m) => m.provenance === "source" && m.state === "loaded")
      .map((m) => m.location)
  );
  const source = evidence.filter(
    (e) =>
      (e.provenance === "course-config" ||
        (e.provenance === "source" && loadedSourceLocations.has(e.location))) &&
      positiveId(e.repositoryId)
  );
  for (const item of evidence) {
    if (!positiveId(item.repositoryId))
      addLegacyFinding(
        result,
        "repository_identity_unresolved",
        `${item.provenance}:${item.location}#${item.repositoryName}`
      );
    if (
      item.provenance === "runtime" &&
      !source.some(
        (s) => s.repositoryId === item.repositoryId && s.repositoryName === item.repositoryName
      )
    )
      addLegacyFinding(
        result,
        "runtime_repository_unproven",
        `${item.location}#${item.repositoryName}`
      );
    if (
      evidence.some(
        (other) =>
          (other.repositoryName === item.repositoryName &&
            positiveId(other.repositoryId) &&
            positiveId(item.repositoryId) &&
            other.repositoryId !== item.repositoryId) ||
          (positiveId(item.repositoryId) &&
            other.repositoryId === item.repositoryId &&
            other.repositoryName !== item.repositoryName)
      )
    )
      addLegacyFinding(result, "repository_identity_conflict", item.repositoryName, "blocking");
  }
  result.repositories = [...new Set(source.map((e) => e.repositoryId))]
    .filter(positiveId)
    .sort((a, b) => a - b)
    .map((repositoryId) => ({
      repositoryId,
      owner: null,
      name: null,
      evidence: evidence.filter((e) => e.repositoryId === repositoryId),
      associationsComplete: false,
      associations: []
    }));
  if (analysis.runtimeCoverage !== "not_applicable")
    addLegacyFinding(result, "runtime_coverage_unknown", "runtime");
};
