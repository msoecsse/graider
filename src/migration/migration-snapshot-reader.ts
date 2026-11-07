import fs from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { GitCommandWorkspaceFactory, type GitCommandRunner } from "../git/git-command-workspace.js";
import { createDugiteGitRunners } from "../git/dugite-git-runners.js";
import {
  createExactCommitRevision,
  type GitWorkspacePreparer,
  type ObjectId
} from "../git/git-workspace.js";
import type {
  CourseMigrationAnalysis,
  Immutable,
  MigrationSnapshot,
  MigrationSourceBinding,
  TermHistoryCommit
} from "./migration-models.js";
import { analyzeSchemaV1Migration } from "./schema-v1-migration-analyzer.js";
import { compare, freeze, isSafeRelativePath, isSha, sortedUnique } from "./migration-evidence.js";

export interface MigrationReadRequest {
  /** Supplied after outer authentication, immutable remote identity and synchronization checks. */
  readonly binding: MigrationSourceBinding;
  readonly sourceRoot: string;
  readonly runtimeRoot?: string;
  readonly runtimeCoverage: MigrationSnapshot["runtime"]["coverage"];
  readonly trustedIdentities?: MigrationSnapshot["trustedIdentities"];
  readonly studentObservations?: MigrationSnapshot["studentObservations"];
  readonly suggestions?: MigrationSnapshot["suggestions"];
}
const termCodesFromPaths = (files: readonly { readonly path: string }[]) =>
  sortedUnique(
    files.flatMap((file) => {
      const parts = file.path.split("/");
      return parts[0] === "terms" && parts.length > 2 && parts[1] ? [parts[1]] : [];
    })
  );

/** Deliberately does not call courseRuntimePath/createManifestPath: both may seed files. */
export const readRuntimeMigrationManifests = (
  root: string,
  bytesBase64?: Record<string, string>
): Readonly<Record<string, string>> => {
  const files: Record<string, string> = {};
  const readDirectory = (relative: string): string[] => {
    const absolute = path.join(root, relative);
    try {
      const stat = fs.lstatSync(absolute);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error("Unsafe runtime directory.");
      return fs.readdirSync(absolute).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  };
  // Validate every existing ancestor so trusted roots cannot traverse a symlink.
  const absoluteRoot = path.resolve(root);
  let ancestor = path.parse(absoluteRoot).root;
  for (const part of absoluteRoot.slice(ancestor.length).split(path.sep)) {
    ancestor = path.join(ancestor, part);
    try {
      if (fs.lstatSync(ancestor).isSymbolicLink()) throw new Error("Unsafe runtime root.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  for (const term of readDirectory("terms")) {
    readDirectory(`terms/${term}`);
    for (const slug of readDirectory(`terms/${term}/manifests`)) {
      const file = `terms/${term}/manifests/${slug}/manifest.yml`;
      if (!isSafeRelativePath(file)) throw new Error("Unsafe runtime manifest path.");
      // Validate the assignment directory before reading the leaf.
      readDirectory(`terms/${term}/manifests/${slug}`);
      try {
        const absolute = path.join(root, file);
        const stat = fs.lstatSync(absolute);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
          throw new Error("Unsafe runtime manifest.");
        const bytes = fs.readFileSync(absolute);
        files[file] = bytes.toString("utf8");
        if (bytesBase64) bytesBase64[file] = bytes.toString("base64");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  // Collect existing grading artifacts only; never call runtime routing helpers.
  const visitGrading = (relative: string): void => {
    for (const name of readDirectory(relative)) {
      const file = `${relative}/${name}`;
      if (!isSafeRelativePath(file)) throw new Error("Unsafe runtime grading path.");
      const absolute = path.join(root, file);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error("Unsafe runtime grading entry.");
      if (stat.isDirectory()) visitGrading(file);
      else {
        if (!stat.isFile() || stat.nlink !== 1) throw new Error("Unsafe runtime grading file.");
        const bytes = fs.readFileSync(absolute);
        files[file] = bytes.toString("utf8");
        if (bytesBase64) bytesBase64[file] = bytes.toString("base64");
      }
    }
  };
  readDirectory(".graider");
  visitGrading(".graider/grading");
  for (const term of readDirectory("terms")) visitGrading(`terms/${term}/reports`);
  return Object.freeze(files);
};

/** Keeps exact bytes beside decoded text for damaged evidence. */
export const readRuntimeMigrationEvidence = (root: string): MigrationSnapshot["runtime"] => {
  const bytesBase64: Record<string, string> = {};
  return {
    coverage: "machine_local",
    files: readRuntimeMigrationManifests(root, bytesBase64),
    bytesBase64
  };
};

/** Only read methods of the existing GitWorkspace are used; no checkout/fetch is performed. */
export const readMigrationGitHistory = async (
  workspace: Pick<GitWorkspacePreparer, "root" | "listTree">,
  sourceCommitSha: string,
  runReadGit: GitCommandRunner
): Promise<Immutable<MigrationSnapshot["history"]>> => {
  if (!isSha(sourceCommitSha)) return undefined;
  try {
    const replacements = await runReadGit({
      cwd: workspace.root,
      args: ["for-each-ref", "--format=%(refname)", "refs/replace/"]
    });
    if (replacements.trim() !== "")
      return freeze({ sourceCommitSha, complete: false, commits: [] });
    const shallow = (
      await runReadGit({ cwd: workspace.root, args: ["rev-parse", "--is-shallow-repository"] })
    ).trim();
    if (shallow !== "false") return freeze({ sourceCommitSha, complete: false, commits: [] });
    const graph = await runReadGit({
      cwd: workspace.root,
      args: ["rev-list", "--parents", sourceCommitSha, "--"]
    });
    const commits: TermHistoryCommit[] = [];
    for (const line of graph.trim().split("\n")) {
      const [sha, ...parents] = line.trim().split(" ");
      if (!sha || !isSha(sha) || !parents.every(isSha)) return undefined;
      commits.push({
        sha,
        parents,
        termCodes: termCodesFromPaths(await workspace.listTree(sha as ObjectId))
      });
    }
    return freeze({ sourceCommitSha, complete: true, commits });
  } catch {
    return freeze({ sourceCommitSha, complete: false, commits: [] });
  }
};

/** Read-only entry point for future 9.2. Uses bundled Git and exact commit blobs,
 * so dirty worktree contents and runtime routing cannot alter source facts.
 * This does not synchronize, authenticate, approve, persist or publish anything.
 */
export const readSchemaV1MigrationAnalysis = async (
  request: MigrationReadRequest,
  runners = createDugiteGitRunners()
): Promise<CourseMigrationAnalysis> => {
  request = {
    binding: structuredClone(request.binding),
    sourceRoot: request.sourceRoot,
    ...(request.studentObservations === undefined
      ? {}
      : { studentObservations: structuredClone(request.studentObservations) }),
    runtimeCoverage: request.runtimeCoverage,
    ...(request.runtimeRoot === undefined ? {} : { runtimeRoot: request.runtimeRoot }),
    ...(request.trustedIdentities === undefined
      ? {}
      : { trustedIdentities: structuredClone(request.trustedIdentities) }),
    ...(request.suggestions === undefined
      ? {}
      : { suggestions: structuredClone(request.suggestions) })
  };
  const sourceProblems: string[] = [];
  const sourceFiles: Record<string, string> = {};
  const sourceBytesBase64: Record<string, string> = {};
  const snapshot: MigrationSnapshot = {
    binding: structuredClone(request.binding),
    sourceFiles,
    sourceBytesBase64,
    ...(request.studentObservations === undefined
      ? {}
      : { studentObservations: request.studentObservations }),
    runtime: { coverage: request.runtimeCoverage, files: {} },
    sourceProblems,
    ...(request.trustedIdentities === undefined
      ? {}
      : { trustedIdentities: request.trustedIdentities }),
    ...(request.suggestions === undefined ? {} : { suggestions: request.suggestions })
  };
  const revision = createExactCommitRevision(request.binding.sourceCommitSha);
  if (!revision) return analyzeSchemaV1Migration(snapshot);
  // Neither replacement objects nor implicit lazy fetches may change an exact read.
  const env = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_TERMINAL_PROMPT: "0"
  };
  const runReadGit: GitCommandRunner = (command) => runners.runGit({ ...command, env });
  try {
    const factory = new GitCommandWorkspaceFactory({
      runGit: runReadGit,
      runGitBinary: (command) => runners.runGitBinary({ ...command, env })
    });
    const workspace = await factory.open(request.sourceRoot);
    // Match the factory's native canonicalization, including Windows short-path aliases.
    if ((await realpath(request.sourceRoot)) !== workspace.root)
      throw new Error("Source root must be the exact repository root.");
    const graftPath = (
      await runReadGit({ cwd: workspace.root, args: ["rev-parse", "--git-path", "info/grafts"] })
    ).trim();
    if (fs.existsSync(path.resolve(workspace.root, graftPath)))
      throw new Error("Grafted repository history is unsafe.");
    const resolved = await workspace.resolveRevision(revision);
    if (resolved !== request.binding.sourceCommitSha)
      throw new Error("Exact source commit mismatch.");
    const entries = await workspace.listTree(resolved);
    for (const entry of [...entries].sort((a, b) => compare(a.path, b.path))) {
      if (
        entry.objectType !== "blob" ||
        !["100644", "100755"].includes(entry.mode) ||
        !isSafeRelativePath(entry.path)
      ) {
        sourceProblems.push(`Non-regular or unsafe source entry: ${entry.path}`);
        continue;
      }
      const content = await workspace.readRevisionFile(resolved, entry.path);
      if (content === null) sourceProblems.push(`Source blob unavailable: ${entry.path}`);
      else {
        sourceFiles[entry.path] = content;
        if (
          entry.path.startsWith(".graider/grading/") ||
          entry.path.includes("/grading/") ||
          entry.path.includes("/reports/")
        ) {
          const result = await runners.runGitBinary({
            cwd: workspace.root,
            args: ["show", `${resolved}:${entry.path}`],
            env
          });
          const bytes = Buffer.from(result.stdout);
          sourceBytesBase64[entry.path] = bytes.toString("base64");
          sourceFiles[entry.path] = bytes.toString("utf8");
        }
      }
    }
    const history = await readMigrationGitHistory(workspace, resolved, runReadGit);
    if (history !== undefined) snapshot.history = history;
  } catch {
    sourceProblems.push("Exact source snapshot could not be read safely.");
  }
  if (request.runtimeRoot !== undefined) {
    const relative = path.relative(
      path.resolve(request.sourceRoot),
      path.resolve(request.runtimeRoot)
    );
    if (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) {
      sourceProblems.push("Runtime evidence root must be outside the source repository.");
    } else {
      try {
        snapshot.runtime = readRuntimeMigrationEvidence(request.runtimeRoot);
      } catch {
        snapshot.runtime = { coverage: "unavailable", files: {} };
      }
    }
  } else if (request.runtimeCoverage === "machine_local") snapshot.runtime.coverage = "unavailable";
  return analyzeSchemaV1Migration(snapshot);
};
