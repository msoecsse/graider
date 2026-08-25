import path from "node:path";

import { getGraiderCliStartError, type ProcessRunner } from "./commandRunner.js";
import type { CourseSetupDiagnostic } from "./ipc.js";

const GRAIDER_COMMAND = "graider";
const COMMAND_ARGS = ["assignment", "repository-mappings"] as const;
const JSON_FLAG = "--json";

export interface RepositoryMapping {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly targetId: string;
  readonly repositoryName: string;
  readonly repositoryUrl: string | null;
}

export interface AssignmentRepositoryMappings {
  readonly manifestStatus: "present" | "not_applied";
  readonly mappings: readonly RepositoryMapping[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isContainedPath = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== "..";
};

const parse = (value: unknown): AssignmentRepositoryMappings | null => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.commandName !== "assignment repository-mappings"
  )
    return null;
  const manifest = isRecord(value.manifest) ? value.manifest : null;
  if (
    manifest === null ||
    (manifest.status !== "present" && manifest.status !== "not_applied") ||
    !Array.isArray(value.studentMappings)
  )
    return null;
  const mappings = value.studentMappings.flatMap((item): RepositoryMapping[] => {
    if (
      !isRecord(item) ||
      typeof item.studentId !== "string" ||
      typeof item.githubUsername !== "string" ||
      typeof item.targetId !== "string" ||
      typeof item.repositoryName !== "string" ||
      (typeof item.repositoryUrl !== "string" && item.repositoryUrl !== null)
    )
      return [];
    return [
      {
        studentId: item.studentId,
        githubUsername: item.githubUsername,
        targetId: item.targetId,
        repositoryName: item.repositoryName,
        repositoryUrl: item.repositoryUrl
      }
    ];
  });
  if (mappings.length !== value.studentMappings.length) return null;
  const diagnostics = Array.isArray(value.diagnostics)
    ? value.diagnostics.flatMap((item): CourseSetupDiagnostic[] =>
        isRecord(item) && typeof item.message === "string" ? [diagnostic(item.message)] : []
      )
    : [];
  return { manifestStatus: manifest.status, mappings, diagnostics };
};

export const getAssignmentRepositoryMappings = async ({
  courseFolderPath,
  assignmentFile,
  runner
}: {
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly runner: ProcessRunner;
}): Promise<AssignmentRepositoryMappings> => {
  const root = path.resolve(courseFolderPath);
  const assignmentPath = path.resolve(root, assignmentFile);
  if (!isContainedPath(root, assignmentPath))
    return {
      manifestStatus: "not_applied",
      mappings: [],
      diagnostics: [diagnostic("Assignment path is outside the selected course folder.")]
    };
  const result = await runner({
    command: GRAIDER_COMMAND,
    args: [...COMMAND_ARGS, assignmentFile, JSON_FLAG],
    cwd: root
  });
  if (result.error !== null) {
    const start = getGraiderCliStartError(result.error.code);
    return {
      manifestStatus: "not_applied",
      mappings: [],
      diagnostics: [diagnostic(start?.message ?? "Unable to load assignment repository mappings.")]
    };
  }
  try {
    const parsed = parse(JSON.parse(result.stdout) as unknown);
    return (
      parsed ?? {
        manifestStatus: "not_applied",
        mappings: [],
        diagnostics: [diagnostic("Graider returned invalid repository mappings JSON.")]
      }
    );
  } catch {
    return {
      manifestStatus: "not_applied",
      mappings: [],
      diagnostics: [diagnostic("Graider returned invalid repository mappings JSON.")]
    };
  }
};
