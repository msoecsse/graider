import fs from "node:fs";
import path from "node:path";
import { toRepositoryRelativePath } from "../core/paths.js";
import { createConfigDiagnostic, DiagnosticCode } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import { renderManifestV2Yaml } from "../manifest/manifest-v2-renderer.js";
import type { GroupTargetExecutionResult } from "./group-target-executor.js";
import { buildGroupApplyManifestV2 } from "./group-apply-manifest-finalizer.js";
import type { GroupApplyPreviewTarget } from "./group-preview-planner.js";

export interface GroupApplyManifestFileSystem {
  readonly mkdirSync: (path: string, options: { recursive: true }) => void;
  readonly writeFileSync: (path: string, content: string, encoding: "utf8") => void;
}

export type GroupApplyManifestWriteResult =
  | {
      readonly status: "success";
      readonly manifestPath: string;
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly status: "failure";
      readonly manifestPath: string | null;
      readonly diagnostics: readonly Diagnostic[];
    };

const createWriteFailure = (
  manifestPath: string | null,
  message: string
): GroupApplyManifestWriteResult => ({
  status: "failure",
  manifestPath,
  diagnostics: [
    createConfigDiagnostic(DiagnosticCode.ManifestWriteFailed, message, {
      ...(manifestPath === null ? {} : { manifestPath })
    })
  ]
});

const isSafePathSegment = (value: string): boolean =>
  value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\");

export const writeGroupApplyManifestV2 = (input: {
  readonly repoRoot: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly plannedTargets: readonly GroupApplyPreviewTarget[];
  readonly execution: GroupTargetExecutionResult;
  readonly fileSystem?: GroupApplyManifestFileSystem;
}): GroupApplyManifestWriteResult => {
  const finalization = buildGroupApplyManifestV2(input.plannedTargets, input.execution);
  if (finalization.status === "failure") {
    return {
      status: "failure",
      manifestPath: null,
      diagnostics: finalization.diagnostics
    };
  }

  if (!isSafePathSegment(input.termCode) || !isSafePathSegment(input.assignmentSlug)) {
    return createWriteFailure(null, "Group manifest path is outside the repository root.");
  }

  const manifestPath = createManifestPath(input.repoRoot, input.termCode, input.assignmentSlug);
  try {
    if (
      toRepositoryRelativePath(input.repoRoot, manifestPath.absolutePath) !==
      manifestPath.relativePath
    ) {
      return createWriteFailure(null, "Group manifest path is outside the repository root.");
    }
  } catch {
    return createWriteFailure(null, "Group manifest path is outside the repository root.");
  }

  try {
    const fileSystem = input.fileSystem ?? fs;
    const yaml = renderManifestV2Yaml({
      repositoryMode: "group",
      targets: finalization.targets,
      studentMappings: finalization.studentMappings,
      diagnostics: finalization.diagnostics
    });
    fileSystem.mkdirSync(path.dirname(manifestPath.absolutePath), { recursive: true });
    fileSystem.writeFileSync(manifestPath.absolutePath, yaml, "utf8");
    return { status: "success", manifestPath: manifestPath.relativePath, diagnostics: [] };
  } catch {
    return createWriteFailure(manifestPath.relativePath, "Failed to write group manifest.");
  }
};
