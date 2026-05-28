import path from "node:path";
import { hashFileSha256, hashStringSha256 } from "../core/hash.js";
import { toRepositoryRelativePath } from "../core/paths.js";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

const EMPTY_FINGERPRINT = "";
const EMPTY_LENGTH = 0;

export interface SourceFileHash {
  path: string;
  sha256: string;
}

export interface SourceFingerprintResult {
  sourceFiles: SourceFileHash[];
  inputFingerprint: string;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export interface SourceFingerprintInput {
  repoRoot: string;
  sourceFilePaths: string[];
}

export interface SourceFingerprintPathsInput {
  courseConfigPath: string;
  termConfigPath: string;
  assignmentConfigPath: string;
  rosterFiles: string[];
}

interface ResolvedSourcePath {
  absolutePath: string;
  relativePath: string;
}

const sortSourceFiles = (sourceFiles: readonly SourceFileHash[]): SourceFileHash[] =>
  [...sourceFiles].sort((left, right) => left.path.localeCompare(right.path));

const createSourceOutsideRepoDiagnostic = (repoRoot: string, sourceFilePath: string): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.SourceFileOutsideRepo,
    `Source file ${sourceFilePath} must be inside repository root.`,
    {
      repoRoot,
      sourceFilePath
    }
  );

const resolveSourcePath = (
  repoRoot: string,
  sourceFilePath: string
): ResolvedSourcePath | Diagnostic => {
  const absolutePath = path.isAbsolute(sourceFilePath)
    ? path.resolve(sourceFilePath)
    : path.resolve(repoRoot, sourceFilePath);

  try {
    return {
      absolutePath,
      relativePath: toRepositoryRelativePath(repoRoot, absolutePath)
    };
  } catch {
    return createSourceOutsideRepoDiagnostic(repoRoot, sourceFilePath);
  }
};

export const createInputFingerprint = (sourceFiles: readonly SourceFileHash[]): string =>
  hashStringSha256(JSON.stringify(sortSourceFiles(sourceFiles)));

export const createSourceFingerprint = ({
  repoRoot,
  sourceFilePaths
}: SourceFingerprintInput): SourceFingerprintResult => {
  const sourceFiles: SourceFileHash[] = [];
  const errors: Diagnostic[] = [];

  for (const sourceFilePath of sourceFilePaths) {
    const resolvedSourcePath = resolveSourcePath(repoRoot, sourceFilePath);

    if ("code" in resolvedSourcePath) {
      errors.push(resolvedSourcePath);
    } else {
      const hashResult = hashFileSha256(resolvedSourcePath.absolutePath);

      if (hashResult.status === "failure") {
        errors.push(hashResult.diagnostic);
      } else {
        sourceFiles.push({
          path: resolvedSourcePath.relativePath,
          sha256: hashResult.sha256
        });
      }
    }
  }

  const orderedSourceFiles = sortSourceFiles(sourceFiles);

  return {
    sourceFiles: orderedSourceFiles,
    inputFingerprint:
      errors.length === EMPTY_LENGTH
        ? createInputFingerprint(orderedSourceFiles)
        : EMPTY_FINGERPRINT,
    warnings: [],
    errors
  };
};

export const getSourceFingerprintPaths = ({
  courseConfigPath,
  termConfigPath,
  assignmentConfigPath,
  rosterFiles
}: SourceFingerprintPathsInput): string[] => [
  courseConfigPath,
  termConfigPath,
  assignmentConfigPath,
  ...rosterFiles
];
