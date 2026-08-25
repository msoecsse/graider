import { loadGraiderConfig } from "../config/config-loader.js";
import type { CommandStatus } from "../core/command-result.js";
import { createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { loadManifest } from "../manifest/manifest-loader.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import { normalizeManifestRepositories } from "../manifest/repository-targets.js";

const COMMAND_NAME = "assignment repository-mappings";

export interface AssignmentRepositoryMappingsResult {
  readonly schemaVersion: 1;
  readonly commandName: typeof COMMAND_NAME;
  readonly status: CommandStatus;
  readonly exitCode: 0 | 1 | 2;
  readonly assignment: {
    readonly slug: string;
    readonly title: string;
    readonly path: string;
  } | null;
  readonly manifest: {
    readonly status: "present" | "not_applied" | "invalid";
    readonly schemaVersion: number | null;
    readonly path: string | null;
  };
  readonly repositoryMode: "individual" | "group";
  readonly targets: readonly ReturnType<typeof normalizeManifestRepositories>["targets"][number][];
  readonly studentMappings: readonly ReturnType<
    typeof normalizeManifestRepositories
  >["studentMappings"][number][];
  readonly summary: {
    readonly targetCount: number;
    readonly studentMappingCount: number;
    readonly diagnosticCount: number;
  };
  readonly diagnostics: readonly Diagnostic[];
}

const createResult = (
  status: CommandStatus,
  assignment: AssignmentRepositoryMappingsResult["assignment"],
  manifest: AssignmentRepositoryMappingsResult["manifest"],
  diagnostics: readonly Diagnostic[],
  targets: AssignmentRepositoryMappingsResult["targets"] = [],
  studentMappings: AssignmentRepositoryMappingsResult["studentMappings"] = []
): AssignmentRepositoryMappingsResult => ({
  schemaVersion: 1,
  commandName: COMMAND_NAME,
  status,
  exitCode: status === "success" ? 0 : status === "partial_success" ? 2 : 1,
  assignment,
  manifest,
  repositoryMode: "individual",
  targets,
  studentMappings,
  summary: {
    targetCount: targets.length,
    studentMappingCount: studentMappings.length,
    diagnosticCount: diagnostics.length
  },
  diagnostics
});

export const buildAssignmentRepositoryMappings = ({
  cwd,
  assignmentFile
}: {
  readonly cwd: string;
  readonly assignmentFile: string;
}): AssignmentRepositoryMappingsResult => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });
  if (configResult.status === "failure") {
    return createResult(
      "failure",
      null,
      { status: "invalid", schemaVersion: null, path: null },
      configResult.diagnostics
    );
  }
  const config = configResult.config;
  const assignment = {
    slug: config.summary.assignmentSlug,
    title: config.assignment.assignment.title,
    path: config.summary.assignmentConfigPath
  };
  const manifestPath = createManifestPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath);
  if (manifestResult.status === "missing") {
    return createResult(
      "success",
      assignment,
      { status: "not_applied", schemaVersion: null, path: manifestPath.relativePath },
      [
        createConfigDiagnostic(
          "assignment_not_applied",
          "Repositories have not been created for this assignment yet.",
          { manifestPath: manifestPath.relativePath }
        )
      ]
    );
  }
  if (manifestResult.status === "failure") {
    return createResult(
      "failure",
      assignment,
      { status: "invalid", schemaVersion: null, path: manifestPath.relativePath },
      manifestResult.errors
    );
  }
  const normalized = normalizeManifestRepositories(manifestResult.manifest);
  return {
    ...createResult(
      "success",
      assignment,
      {
        status: "present",
        schemaVersion: manifestResult.manifest.schemaVersion,
        path: manifestPath.relativePath
      },
      [...manifestResult.warnings, ...manifestResult.errors],
      normalized.targets,
      normalized.studentMappings
    ),
    repositoryMode: manifestResult.manifest.repositoryMode ?? "individual"
  };
};

export const createRepositoryMappingsJsonRequiredResult = (): AssignmentRepositoryMappingsResult =>
  createResult("failure", null, { status: "invalid", schemaVersion: null, path: null }, [
    createConfigDiagnostic(
      "assignment_repository_mappings_json_required",
      "The assignment repository-mappings command only supports JSON output. Run with --json."
    )
  ]);
