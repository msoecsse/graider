import fs from "node:fs";
import path from "node:path";

export interface SubmissionSourceRequest {
  readonly repositoryRoot: string;
  readonly requiredFiles: readonly string[];
}

export interface SourceLocation {
  readonly file: string;
  readonly sourceLine: number;
}

export interface SourceRange {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface FoundSourceSection {
  readonly status: "found";
  readonly file: string;
  readonly sourceText: string;
  readonly sourceLineCount: number;
  readonly combinedStartLine: number;
  readonly combinedEndLine: number;
  readonly insertionLine: number;
}

export interface MissingSourceSection {
  readonly status: "missing";
  readonly file: string;
  readonly insertionLine: number;
}

export interface AmbiguousSourceSection {
  readonly status: "ambiguous";
  readonly file: string;
  readonly candidates: readonly string[];
  readonly insertionLine: number;
}

export type SubmissionSourceSection =
  | FoundSourceSection
  | MissingSourceSection
  | AmbiguousSourceSection;

export interface SubmissionSourceModel {
  readonly sections: readonly SubmissionSourceSection[];
  readonly combinedText: string;
  readonly syntheticCombinedLines: readonly number[];
}

export interface SubmissionSourceFailure {
  readonly status: "failure";
  readonly code: string;
  readonly message: string;
  readonly file?: string;
}

export type SubmissionSourceResult =
  | { readonly status: "success"; readonly value: SubmissionSourceModel }
  | SubmissionSourceFailure;

const isWithinRoot = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

const normalizeCombinedSource = (sourceText: string): string =>
  sourceText.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");

const sourceLines = (sourceText: string): string[] =>
  normalizeCombinedSource(sourceText).split("\n");

const failure = (code: string, message: string, file?: string): SubmissionSourceFailure => ({
  status: "failure",
  code,
  message,
  ...(file === undefined ? {} : { file })
});

const resolveRequiredFile = (
  root: string,
  requiredFile: string
): { readonly status: "success"; readonly path: string } | SubmissionSourceFailure => {
  if (
    requiredFile.trim() === "" ||
    path.isAbsolute(requiredFile) ||
    path.win32.isAbsolute(requiredFile)
  )
    return failure("unsafe_required_file_path", "Required file path is unsafe.", requiredFile);
  const resolved = path.resolve(root, requiredFile);
  if (!isWithinRoot(root, resolved))
    return failure(
      "unsafe_required_file_path",
      "Required file path escapes the repository.",
      requiredFile
    );
  return { status: "success", path: resolved };
};

const repositoryRelativePath = (root: string, file: string): string =>
  path.relative(root, file).split(path.sep).join("/");

const isExplicitRepositoryRelativePath = (requiredFile: string): boolean =>
  requiredFile.includes("/") || requiredFile.includes("\\");

const eligibleSourceFilePaths = (
  root: string,
  requiredFile: string
): { readonly status: "success"; readonly paths: readonly string[] } | SubmissionSourceFailure => {
  const sourceRoot = path.join(root, "src");
  const paths: string[] = [];
  const visit = (directory: string, isSourceRoot: boolean): SubmissionSourceFailure | undefined => {
    let entries: fs.Dirent[];
    try {
      entries = fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      return failure(
        "required_file_read_failed",
        "Unable to inspect student source tree.",
        requiredFile
      );
    }
    for (const entry of entries) {
      if (isSourceRoot && entry.name === "test") continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const visitFailure = visit(candidate, false);
        if (visitFailure !== undefined) return visitFailure;
      } else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name === requiredFile)
        paths.push(repositoryRelativePath(root, candidate));
    }
    return undefined;
  };
  const visitFailure = visit(sourceRoot, true);
  return visitFailure === undefined ? { status: "success", paths } : visitFailure;
};

export const buildSubmissionSourceModel = (
  request: SubmissionSourceRequest
): SubmissionSourceResult => {
  let repositoryRoot: string;
  try {
    repositoryRoot = fs.realpathSync(request.repositoryRoot);
    if (!fs.statSync(repositoryRoot).isDirectory())
      return failure("repository_root_unreadable", "Student repository root is not a directory.");
  } catch {
    return failure("repository_root_unreadable", "Unable to read student repository root.");
  }

  const sections: SubmissionSourceSection[] = [];
  const combinedLines: string[] = [];
  const syntheticCombinedLines: number[] = [];
  let foundFiles = 0;
  for (const requiredFile of request.requiredFiles) {
    let resolvedFile = requiredFile;
    if (!isExplicitRepositoryRelativePath(requiredFile)) {
      const candidates = eligibleSourceFilePaths(repositoryRoot, requiredFile);
      if (candidates.status === "failure") return candidates;
      if (candidates.paths.length === 0) {
        sections.push({
          status: "missing",
          file: resolvedFile,
          insertionLine: combinedLines.length + 1
        });
        continue;
      }
      if (candidates.paths.length > 1) {
        sections.push({
          status: "ambiguous",
          file: requiredFile,
          candidates: candidates.paths,
          insertionLine: combinedLines.length + 1
        });
        continue;
      }
      resolvedFile = candidates.paths[0] as string;
    }
    const resolved = resolveRequiredFile(repositoryRoot, resolvedFile);
    if (resolved.status === "failure") return resolved;
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(resolved.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        sections.push({
          status: "missing",
          file: requiredFile,
          insertionLine: combinedLines.length + 1
        });
        continue;
      }
      return failure("required_file_read_failed", "Unable to inspect required file.", requiredFile);
    }
    if (!stat.isFile() && !stat.isSymbolicLink())
      return failure(
        "required_file_not_regular",
        "Required source path is not a regular file.",
        requiredFile
      );

    let realFilePath: string;
    try {
      realFilePath = fs.realpathSync(resolved.path);
    } catch {
      return failure("required_file_read_failed", "Unable to resolve required file.", requiredFile);
    }
    if (!isWithinRoot(repositoryRoot, realFilePath))
      return failure(
        "unsafe_required_file_path",
        "Required file symlink escapes the repository.",
        requiredFile
      );
    try {
      if (!fs.statSync(realFilePath).isFile())
        return failure(
          "required_file_not_regular",
          "Required source path is not a regular file.",
          requiredFile
        );
    } catch {
      return failure("required_file_read_failed", "Unable to inspect required file.", requiredFile);
    }
    let sourceText: string;
    try {
      sourceText = fs.readFileSync(realFilePath, "utf8");
    } catch {
      return failure("required_file_read_failed", "Unable to read required file.", requiredFile);
    }
    const lines = sourceLines(sourceText);
    if (foundFiles > 0) {
      syntheticCombinedLines.push(combinedLines.length + 1);
      combinedLines.push("");
    }
    const combinedStartLine = combinedLines.length + 1;
    combinedLines.push(...lines);
    sections.push({
      status: "found",
      file: resolvedFile,
      sourceText,
      sourceLineCount: lines.length,
      combinedStartLine,
      combinedEndLine: combinedLines.length,
      insertionLine: combinedStartLine
    });
    foundFiles += 1;
  }
  return {
    status: "success",
    value: { sections, combinedText: combinedLines.join("\n"), syntheticCombinedLines }
  };
};

export const combinedLineToSourceLocation = (
  model: SubmissionSourceModel,
  combinedLine: number
): SourceLocation | undefined => {
  if (!Number.isInteger(combinedLine) || combinedLine < 1) return undefined;
  const section = model.sections.find(
    (entry): entry is FoundSourceSection =>
      entry.status === "found" &&
      combinedLine >= entry.combinedStartLine &&
      combinedLine <= entry.combinedEndLine
  );
  return section === undefined
    ? undefined
    : { file: section.file, sourceLine: combinedLine - section.combinedStartLine + 1 };
};

export const combinedRangeToSourceRange = (
  model: SubmissionSourceModel,
  startLine: number,
  endLine: number
): SourceRange | undefined => {
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine
  )
    return undefined;
  const start = combinedLineToSourceLocation(model, startLine);
  const end = combinedLineToSourceLocation(model, endLine);
  if (start === undefined || end === undefined || start.file !== end.file) return undefined;
  return { file: start.file, startLine: start.sourceLine, endLine: end.sourceLine };
};
