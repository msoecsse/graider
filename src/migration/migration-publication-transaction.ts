import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parse } from "yaml";
import { GitCommandWorkspaceFactory } from "../git/git-command-workspace.js";
import { createMigrationGitRunners } from "./migration-git.js";
import { createExactCommitRevision } from "../git/git-workspace.js";
import { publicationBindingSchema } from "./migration-compatibility-validation.js";
import {
  migrationPathSchema,
  migrationMetadataSchema,
  migrationCourseSchema
} from "./migration-candidate-schemas.js";
import { bytesHash, compare, fingerprint, freeze } from "./migration-evidence.js";
import type { MigrationCandidate, MigrationCandidateFile } from "./migration-candidate.js";
const SINGLE_PARENT_FIELD_COUNT = 2;
const REGULAR_FILE_MODE = "100644";
const sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
export const migrationPublicationIntentSchema = z
  .object({
    kind: z.literal("migration-publication-intent"),
    version: z.literal(1),
    binding: publicationBindingSchema,
    commit: sha,
    filesFingerprint: z.string().regex(/^[a-f0-9]{64}$/u)
  })
  .strict();
export type MigrationPublicationIntent = z.infer<typeof migrationPublicationIntentSchema>;
export const migrationFileSetFingerprint = (
  files: readonly Pick<MigrationCandidateFile, "path" | "sha256">[]
): string =>
  fingerprint(
    [...files].map(({ path, sha256 }) => ({ path, sha256 })).sort((a, b) => compare(a.path, b.path))
  );

/** Include ignored files; reject links and aliases before any writer uses these paths. */
export const verifyMigrationTransactionFiles = (
  root: string,
  files: readonly MigrationCandidateFile[]
): void => {
  const actual: { path: string; sha256: string }[] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (prefix !== "" || entry.name !== ".git") {
        const relative = `${prefix}${entry.name}`;
        migrationPathSchema.parse(relative);
        const absolute = path.join(directory, entry.name);
        const stat = fs.lstatSync(absolute);
        if (stat.isDirectory() && !stat.isSymbolicLink()) visit(absolute, `${relative}/`);
        else if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1)
          actual.push({ path: relative, sha256: bytesHash(fs.readFileSync(absolute)) });
        else throw new Error("Unsafe migration transaction contents.");
      }
    }
  };
  visit(root, "");
  if (migrationFileSetFingerprint(actual) !== migrationFileSetFingerprint(files))
    throw new Error("Migration transaction contents differ from the exact candidate.");
};

/** Reconstruct validator input from the actual workspace, retaining only trusted
 * file kinds/audit. Full validation must run again on these observed bytes.
 */
export const readMigrationTransactionCandidate = (
  root: string,
  candidate: MigrationCandidate
): MigrationCandidate => {
  verifyMigrationTransactionFiles(root, candidate.files);
  return freeze({
    ...candidate,
    files: candidate.files.map((file) => {
      const bytes = fs.readFileSync(path.join(root, ...file.path.split("/")));
      return {
        ...file,
        content: bytes.toString("utf8"),
        bytesBase64: bytes.toString("base64"),
        sha256: bytesHash(bytes)
      };
    })
  });
};

/** Independently verify committed Git objects, never the index or a successful commit response.
 * This is also safe after restart: the disk intent is a locator, not permission to write.
 */
export const verifyMigrationPublicationCommit = async (
  root: string,
  intent: MigrationPublicationIntent,
  authoritativeRevision?: string
): Promise<boolean> => {
  const record = migrationPublicationIntentSchema.parse(intent);
  const revision = createExactCommitRevision(record.commit);
  if (!revision) throw new Error("Invalid migration commit.");
  const runner = createMigrationGitRunners();
  if (authoritativeRevision !== undefined) {
    if (!createExactCommitRevision(authoritativeRevision))
      throw new Error("Invalid authoritative revision.");
    const history = await runner.runGit({
      cwd: root,
      args: ["rev-list", authoritativeRevision, "--"]
    });
    if (!history.trim().split(/\s+/u).includes(record.commit)) return false;
  }
  const factory = new GitCommandWorkspaceFactory(runner);
  const workspace = await factory.open(root);
  const commit = await workspace.resolveRevision(revision);
  const parents = (
    await runner.runGit({ cwd: root, args: ["rev-list", "--parents", "-n", "1", commit] })
  )
    .trim()
    .split(/\s+/u);
  if (
    parents.length !== SINGLE_PARENT_FIELD_COUNT ||
    parents[0] !== commit ||
    parents[1] !== record.binding.sourceCommitSha
  )
    throw new Error("Migration commit is not based on the exact reviewed source.");
  const source = createExactCommitRevision(record.binding.sourceCommitSha);
  if (!source) throw new Error("Invalid source revision.");
  const sourceModes = new Map(
    (await workspace.listTree(await workspace.resolveRevision(source))).map((entry) => [
      entry.path as string,
      entry.mode
    ])
  );
  const tree = await workspace.listTree(commit);
  const files: { path: string; sha256: string }[] = [];
  let course: unknown;
  let metadata: unknown;
  for (const entry of tree) {
    migrationPathSchema.parse(entry.path);
    if (
      entry.objectType !== "blob" ||
      entry.mode !== (sourceModes.get(entry.path) ?? REGULAR_FILE_MODE)
    )
      throw new Error("Unexpected committed migration path.");
    const data = await runner.runGitBinary({
      cwd: root,
      args: ["cat-file", "blob", entry.objectId]
    });
    const bytes = Buffer.from(data.stdout);
    files.push({ path: entry.path, sha256: bytesHash(bytes) });
    if (entry.path === "course.yml") course = parse(bytes.toString("utf8"));
    if (entry.path === ".graider/migration.json")
      metadata = JSON.parse(bytes.toString("utf8")) as unknown;
  }
  if (migrationFileSetFingerprint(files) !== record.filesFingerprint)
    throw new Error("Committed migration contents changed.");
  const parsedCourse = migrationCourseSchema.parse(course);
  const parsedMetadata = migrationMetadataSchema.parse(metadata);
  const binding = record.binding;
  if (
    parsedCourse.course.repository_id !== binding.repositoryId ||
    parsedCourse.course.organization_binding.organization_id !== binding.organizationId ||
    parsedMetadata.source.repository_id !== binding.repositoryId ||
    parsedMetadata.source.organization_id !== binding.organizationId ||
    parsedMetadata.source.source_commit_sha !== binding.sourceCommitSha ||
    parsedMetadata.source.report_id !== binding.reportId ||
    parsedMetadata.source.authenticated_github_user_id !== binding.authenticatedGithubUserId
  )
    throw new Error("Published migration identity differs from the exact reviewed source.");
  return true;
};
