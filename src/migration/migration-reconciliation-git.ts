import { parse } from "yaml";
import fs from "node:fs";
import path from "node:path";
import { GitCommandWorkspaceFactory } from "../git/git-command-workspace.js";
import { createExactCommitRevision, migrationCheckpointReference } from "../git/git-workspace.js";
import {
  rawCourseConfigV1Schema,
  rawTermConfigV2Schema,
  rawTermConfigV1Schema,
  rawAssignmentConfigSchema
} from "../config/config-schemas.js";
import { createInputFingerprint } from "../config/source-fingerprint.js";
import { parseManifest } from "../manifest/manifest-loader.js";
import {
  studentTargetsFromManifest,
  validateStudentRepositoryTargets,
  type TrustedStudentRepositoryTarget
} from "../github/student-repository-target.js";
import { createMigrationGitRunners } from "./migration-git.js";
import {
  migrationCourseSchema,
  migrationMetadataSchema,
  migrationPathSchema
} from "./migration-candidate-schemas.js";
import { bytesHash, fingerprint, stableJson, compare } from "./migration-evidence.js";
import {
  RECONCILIATION_PATH,
  canRecoverMigration,
  reconciliationRecordSchema,
  validateReconciliationRecord,
  reconciliationValue,
  ReconciliationNeedsAttention,
  createFreshReconciliationRecord,
  type ReconciliationSnapshot,
  type MigrationHistorySnapshot
} from "./migration-reconciliation-state.js";

const HISTORY_LIMIT = 10_000;
const MAX_TREE_ENTRIES = 10_000;
const KIBIBYTE = 1024;
const MEBIBYTE = KIBIBYTE * KIBIBYTE;
const MAX_SNAPSHOT_MEBIBYTES = 32;
const MAX_SNAPSHOT_BYTES = MAX_SNAPSHOT_MEBIBYTES * MEBIBYTE;
const MAX_BLOB_BYTES = 2 * MEBIBYTE;
const METADATA_PATH = ".graider/migration.json";
const SINGLE_PARENT_FIELDS = 2;
/** Exact Git objects only. Every intermediate descendant is checked, including changed-then-restored files.
 * The caller independently proves current remote identity/revision and the immutable remote checkpoint.
 */
export const readMigrationHistorySnapshot = async (
  root: string,
  revision: string
): Promise<MigrationHistorySnapshot> => {
  const exact = createExactCommitRevision(revision);
  if (!exact) throw new Error("Invalid authoritative revision.");
  const runners = createMigrationGitRunners();
  const workspace = await new GitCommandWorkspaceFactory(runners).open(root);
  const git = async (...args: string[]) => (await runners.runGit({ cwd: root, args })).trim();
  let totalBytes = 0;
  const blobs = new Map<string, Buffer>();
  const blob = async (objectId: string): Promise<Buffer> => {
    const cached = blobs.get(objectId);
    if (cached) return cached;
    const result = await runners.runGitBinary({ cwd: root, args: ["cat-file", "blob", objectId] });
    const bytes = Buffer.from(result.stdout);
    totalBytes += bytes.length;
    if (bytes.length > MAX_BLOB_BYTES || totalBytes > MAX_SNAPSHOT_BYTES)
      throw new Error("Recovery evidence exceeds its safe bound.");
    blobs.set(objectId, bytes);
    return bytes;
  };
  const tree = async (sha: string) => {
    const commit = createExactCommitRevision(sha);
    if (!commit) throw new Error("Invalid history commit.");
    const entries = await workspace.listTree(await workspace.resolveRevision(commit));
    if (entries.length > MAX_TREE_ENTRIES)
      throw new Error("Reconciliation tree exceeds its safe bound.");
    const names = new Set<string>();
    const prefixes = new Map<string, string>();
    for (const entry of entries) {
      migrationPathSchema.parse(entry.path);
      if (
        entry.objectType !== "blob" ||
        !["100644", "100755"].includes(entry.mode) ||
        names.has(entry.path.toLowerCase())
      )
        throw new Error("Unsafe reconciliation tree.");
      names.add(entry.path.toLowerCase());
      entry.path.split("/").forEach((_, index, parts) => {
        const prefix = parts.slice(0, index + 1).join("/");
        const previous = prefixes.get(prefix.toLowerCase());
        if (previous !== undefined && previous !== prefix)
          throw new Error("Nonportable reconciliation namespace.");
        prefixes.set(prefix.toLowerCase(), prefix);
      });
    }
    return entries;
  };
  const currentTree = await tree(revision);
  const metadataEntry = currentTree.find((entry) => entry.path === METADATA_PATH);
  if (!metadataEntry) throw new Error("No published migration audit exists.");
  const metadata = migrationMetadataSchema.parse(
    JSON.parse((await blob(metadataEntry.objectId)).toString("utf8"))
  );
  const source = metadata.source.source_commit_sha;
  const history = (
    await git(
      "rev-list",
      "--first-parent",
      "--parents",
      `--max-count=${String(HISTORY_LIMIT)}`,
      revision,
      "--"
    )
  )
    .split("\n")
    .map((line) => line.split(" "));
  const sourceIndex = history.findIndex((fields) => fields[0] === source);
  if (
    sourceIndex < 1 ||
    history.slice(0, sourceIndex).some((fields) => fields.length !== SINGLE_PARENT_FIELDS)
  )
    throw new Error("Publication is not on exact single-parent source history.");
  const publication = reconciliationValue(reconciliationValue(history[sourceIndex - 1])[0]);
  const publishedTree = await tree(publication);
  if (publishedTree.some((entry) => entry.path === RECONCILIATION_PATH))
    throw new Error("Publication cannot contain an asserted completed journal.");
  const files = new Map<string, Buffer>();
  const fingerprints: { path: string; sha256: string; mode: string }[] = [];
  for (const entry of publishedTree) {
    const bytes = await blob(entry.objectId);
    files.set(entry.path, bytes);
    fingerprints.push({ path: entry.path, sha256: bytesHash(bytes), mode: entry.mode });
  }
  const publishedMetadata = migrationMetadataSchema.parse(
    JSON.parse(reconciliationValue(files.get(METADATA_PATH)).toString("utf8"))
  );
  if (stableJson(metadata) !== stableJson(publishedMetadata))
    throw new ReconciliationNeedsAttention("fresh_plan_required");
  const reviewed = metadata.audit.review.source;
  if (
    reviewed.repositoryId !== metadata.source.repository_id ||
    reviewed.sourceCommitSha !== source ||
    reviewed.reportId !== metadata.source.report_id ||
    reviewed.authenticatedGithubUserId !== metadata.source.authenticated_github_user_id
  )
    throw new ReconciliationNeedsAttention("fresh_plan_required");
  let course = migrationCourseSchema.parse(parse(files.get("course.yml")?.toString("utf8") ?? ""));
  if (
    course.course.repository_id !== metadata.source.repository_id ||
    course.course.organization_binding.organization_id !== metadata.source.organization_id ||
    !course.faculty_directory.some(
      (f) => f.github_user_id === metadata.source.authenticated_github_user_id
    )
  )
    throw new Error("Published migration identity mismatch.");
  let terms = publishedTree
    .filter((entry) => /^terms\/[^/]+\/term\.yml$/u.test(entry.path))
    .map((entry) => {
      const term = rawTermConfigV2Schema.parse(
        parse(reconciliationValue(files.get(entry.path)).toString("utf8"))
      );
      if (entry.path !== `terms/${term.term.code}/term.yml`)
        throw new Error("Term scope mismatch.");
      return term;
    });
  // Validates the entire term/role/order/lifecycle set without granting the reviewer recovery authority.
  if (!canRecoverMigration(course, terms, course.fallback_administrator.github_user_id))
    throw new Error("Invalid published role state.");
  const publishedCourse = course;
  const publishedTerms = terms;
  const readDomain = async (entries: typeof publishedTree) => {
    const read = async (file: string) =>
      (
        await blob(reconciliationValue(entries.find((entry) => entry.path === file)).objectId)
      ).toString("utf8");
    const currentCourse = migrationCourseSchema.parse(parse(await read("course.yml")));
    const currentTerms = [];
    for (const entry of entries.filter((file) => /^terms\/[^/]+\/term\.yml$/u.test(file.path))) {
      const term = rawTermConfigV2Schema.parse(parse(await read(entry.path)));
      if (entry.path !== `terms/${term.term.code}/term.yml`)
        throw new Error("Term scope mismatch.");
      currentTerms.push(term);
    }
    if (
      currentCourse.course.repository_id !== metadata.source.repository_id ||
      currentCourse.course.organization_binding.organization_id !==
        metadata.source.organization_id ||
      !canRecoverMigration(
        currentCourse,
        currentTerms,
        currentCourse.fallback_administrator.github_user_id
      )
    )
      throw new Error("Invalid current course identity or role state.");
    const files = [];
    for (const entry of entries.filter((file) => file.path !== RECONCILIATION_PATH))
      files.push({ path: entry.path, sha256: bytesHash(await blob(entry.objectId)) });
    return { course: currentCourse, terms: currentTerms, intendedFingerprint: fingerprint(files) };
  };
  const sourceTree = await tree(source);
  const originals = new Map<string, Buffer>();
  for (const entry of sourceTree) {
    const published = publishedTree.find((file) => file.path === entry.path);
    if (!published || published.mode !== entry.mode || entry.path === RECONCILIATION_PATH)
      throw new Error("Original migration evidence was removed or changed mode.");
    const bytes = await blob(entry.objectId);
    originals.set(entry.path, bytes);
    if (published.objectId !== entry.objectId) {
      const audited = metadata.audit.original_files.find((file) => file.path === entry.path);
      if (
        !audited ||
        audited.sha256 !== bytesHash(bytes) ||
        audited.bytes_base64 !== bytes.toString("base64")
      )
        throw new Error("Source recovery provenance differs.");
    }
  }
  rawCourseConfigV1Schema.parse(parse(originals.get("course.yml")?.toString("utf8") ?? ""));
  const recovery = metadata.recovery;
  if (recovery) {
    const bound = recovery.legacy.source;
    if (
      recovery.legacy.status === "blocked" ||
      recovery.legacy.audit.accessReview.status !== "complete" ||
      stableJson(bound) !== stableJson(recovery.legacy.audit.inventory.source) ||
      stableJson(bound) !== stableJson(recovery.legacy.audit.accessReview.source)
    )
      throw new ReconciliationNeedsAttention("fresh_plan_required");
    if (
      bound.repositoryId !== metadata.source.repository_id ||
      bound.organizationId !== metadata.source.organization_id ||
      bound.sourceCommitSha !== source ||
      bound.reportId !== metadata.source.report_id ||
      bound.authenticatedGithubUserId !== metadata.source.authenticated_github_user_id
    )
      throw new Error("Stored intent has foreign provenance.");
    if (
      stableJson(
        recovery.legacy.reconciliation.grants.map((g) => ({
          organization_id: g.organizationId,
          team_id: g.teamId,
          repository_id: g.repositoryId,
          observed_permission: g.observedPermission,
          requires: g.requires
        }))
      ) !== stableJson(metadata.reconciliation.grants)
    )
      throw new Error("Stored cleanup intent changed.");
  }
  const currentDomain = await readDomain(currentTree);
  course = currentDomain.course;
  terms = currentDomain.terms;
  const targets: TrustedStudentRepositoryTarget[] = [];
  const unsafeRepositoryIds = new Set<number>();
  let unknownOperationalScope = false;
  const targetAttention: string[] = files.has(".graider/reconciliation.yml")
    ? ["unrecognized_reconciliation_metadata"]
    : [];
  const required = (termCode: string | null) =>
    terms.some((term) => term.term.code === termCode && term.term.status === "active");
  for (const evidence of metadata.evidence.filter(
    (entry) => entry.kind === "manifest" && entry.provenance === "source"
  )) {
    const content = originals.get(evidence.location);
    const termCode = /^terms\/([^/]+)\//u.exec(evidence.location)?.[1] ?? null;
    if (!content) {
      if (evidence.content_fingerprint !== null && required(termCode))
        targetAttention.push("required_student_scope_unverified");
    } else {
      const parsed = parseManifest(content.toString("utf8"), evidence.location);
      const conflicting = metadata.evidence.some(
        (other) =>
          other.kind === "manifest" &&
          other.provenance === "runtime" &&
          other.location === evidence.location &&
          other.content_fingerprint !== null &&
          other.content_fingerprint !== evidence.content_fingerprint
      );
      const trusted = () => {
        if (parsed.status !== "loaded" || parsed.manifest.schemaVersion !== 1) return false;
        const manifest = parsed.manifest;
        const assignmentPath = `terms/${manifest.assignment.termCode}/assignments/${manifest.assignment.assignmentSlug}/assignment.yml`;
        const assignment = rawAssignmentConfigSchema.safeParse(
          parse(originals.get(assignmentPath)?.toString("utf8") ?? "")
        );
        const term = rawTermConfigV1Schema.safeParse(
          parse(
            originals.get(`terms/${manifest.assignment.termCode}/term.yml`)?.toString("utf8") ?? ""
          )
        );
        if (
          !assignment.success ||
          !term.success ||
          assignment.data.repository_mode === "group" ||
          manifest.assignment.courseCode !== course.course.code ||
          manifest.assignment.termCode !== termCode ||
          evidence.location !==
            `terms/${manifest.assignment.termCode}/manifests/${manifest.assignment.assignmentSlug}/manifest.yml`
        )
          return false;
        const expected = [
          "course.yml",
          `terms/${termCode}/term.yml`,
          assignmentPath,
          ...term.data.sections
            .filter(
              (section) =>
                assignment.data.sections.includes(section.id) && section.roster !== undefined
            )
            .map((section) => `terms/${termCode}/${section.roster ?? ""}`)
        ];
        const anchors = manifest.source.sourceFiles;
        return (
          anchors.length > 0 &&
          new Set(anchors.map((anchor) => anchor.path)).size === anchors.length &&
          expected.every((file) => anchors.some((anchor) => anchor.path === file)) &&
          createInputFingerprint(anchors) === manifest.source.inputFingerprint &&
          anchors.every((anchor) => {
            const bytes = originals.get(anchor.path);
            return bytes !== undefined && bytesHash(bytes) === anchor.sha256;
          }) &&
          manifest.repositories.every((repository) =>
            assignment.data.sections.includes(repository.section)
          )
        );
      };
      if (
        parsed.status !== "loaded" ||
        evidence.content_fingerprint !== bytesHash(content) ||
        conflicting ||
        !trusted()
      ) {
        if (parsed.status !== "loaded" && required(termCode)) unknownOperationalScope = true;
        if (parsed.status === "loaded")
          for (const repository of parsed.manifest.repositories)
            if (repository.repository.id !== undefined)
              unsafeRepositoryIds.add(repository.repository.id);
        if (required(termCode)) targetAttention.push("required_student_scope_unverified");
      } else {
        for (const target of studentTargetsFromManifest(parsed.manifest, {
          courseRepositoryId: course.course.repository_id,
          organizationId: course.course.organization_binding.organization_id
        })) {
          if (target.status !== "ready") {
            if (target.repositoryId !== null) unsafeRepositoryIds.add(target.repositoryId);
            if (required(target.termCode)) targetAttention.push(target.reason);
          } else {
            const t = target.target;
            const observations = metadata.students.filter(
              (student) => student.termCode === t.termCode && student.studentId === t.targetId
            );
            const sections = new Set(observations.map((student) => student.sectionId));
            const intended = terms.find((term) => term.term.code === t.termCode);
            const repository = parsed.manifest.repositories.find(
              (row) => row.repository.id === t.repositoryId
            );
            if (
              sections.size !== 1 ||
              !sections.has(t.sectionId) ||
              !observations.some(
                (student) => student.githubUsername === repository?.githubUsername
              ) ||
              !intended?.sections.some((section) => section.id === t.sectionId) ||
              intended.term.status === "draft" ||
              t.repositoryId === course.course.repository_id ||
              evidence.location !== `terms/${t.termCode}/manifests/${t.assignmentSlug}/manifest.yml`
            ) {
              unsafeRepositoryIds.add(t.repositoryId);
              if (required(t.termCode) || intended?.term.status === "draft")
                targetAttention.push("required_student_scope_unverified");
            } else targets.push(t);
          }
        }
      }
    }
  }
  const safeTargets: TrustedStudentRepositoryTarget[] = [];
  for (const evidence of metadata.evidence.filter(
    (entry) =>
      entry.kind === "manifest" &&
      entry.provenance === "runtime" &&
      entry.content_fingerprint !== null
  )) {
    const termCode = /^terms\/([^/]+)\//u.exec(evidence.location)?.[1] ?? null;
    if (
      required(termCode) &&
      !metadata.evidence.some(
        (source) =>
          source.kind === "manifest" &&
          source.provenance === "source" &&
          source.location === evidence.location &&
          source.content_fingerprint === evidence.content_fingerprint
      )
    ) {
      unknownOperationalScope = true;
      targetAttention.push("required_student_scope_unverified");
    }
  }
  for (const target of validateStudentRepositoryTargets(targets)) {
    if (target.status === "ready") {
      if (!unknownOperationalScope && !unsafeRepositoryIds.has(target.target.repositoryId))
        safeTargets.push(target.target);
      else if (required(target.target.termCode))
        targetAttention.push("required_student_scope_unverified");
    } else if (required(target.termCode)) targetAttention.push(target.reason);
  }
  // Original manifests prove only the reviewed source scope. Changed resource evidence
  // cannot inherit that proof; withhold it until a trusted current inventory is available.
  const unprovenTerms = new Set<string>();
  const resourceEvidence = (file: string) =>
    /^terms\/[^/]+\/(?:assignments|manifests|rosters)\//u.test(file) ||
    metadata.students.some((student) => student.location === file) ||
    metadata.evidence.some(
      (evidence) => evidence.kind === "manifest" && evidence.location === file
    );
  for (const entry of [...currentTree, ...publishedTree]) {
    const termCode = /^terms\/([^/]+)\//u.exec(entry.path)?.[1];
    if (
      termCode &&
      resourceEvidence(entry.path) &&
      (!currentTree.some((file) => stableJson(file) === stableJson(entry)) ||
        !publishedTree.some((file) => stableJson(file) === stableJson(entry)))
    )
      unprovenTerms.add(termCode);
  }
  const scope = (term: (typeof terms)[number] | undefined) =>
    term?.sections.map((section) => ({ id: section.id, roster: section.roster }));
  for (const term of terms)
    if (
      stableJson(scope(term)) !==
      stableJson(scope(publishedTerms.find((original) => original.term.code === term.term.code)))
    )
      unprovenTerms.add(term.term.code);
  if (terms.some((term) => term.term.status === "active" && unprovenTerms.has(term.term.code)))
    targetAttention.push("current_resource_scope_unverified");
  const publicationDate = await git("show", "-s", "--format=%cI", publication, "--");
  if (!Number.isFinite(Date.parse(publicationDate))) throw new Error("Invalid publication date.");
  const snapshot: MigrationHistorySnapshot = {
    publicationDate,
    reviewedAuthority: {
      fallbackAdministratorGithubUserId: publishedCourse.fallback_administrator.github_user_id,
      termCreationOrder: publishedCourse.course.term_creation_order
    },
    revision: publication,
    publication,
    source,
    checkpoint: migrationCheckpointReference(source),
    intendedFingerprint: fingerprint(fingerprints.map(({ path, sha256 }) => ({ path, sha256 }))),
    course: publishedCourse,
    terms: publishedTerms,
    metadata,
    targets: safeTargets.filter((target) => !unprovenTerms.has(target.termCode)),
    targetAttention: [...new Set(targetAttention)],
    record: null,
    executionState: "current_plan"
  };
  const domainTree = (entries: Awaited<ReturnType<typeof tree>>) =>
    stableJson(entries.filter((entry) => entry.path !== RECONCILIATION_PATH));
  let previousTree = publishedTree;
  // Replay oldest first; no changed-then-restored domain data or deleted journal can hide in ancestry.
  for (const fields of history.slice(0, sourceIndex - 1).reverse()) {
    const commit = reconciliationValue(fields[0]);
    const entries = await tree(commit);
    if (entries.some((entry) => entry.path === ".graider/reconciliation.yml"))
      snapshot.targetAttention = [
        ...new Set([...snapshot.targetAttention, "unrecognized_reconciliation_metadata"])
      ];
    const audit = entries.find((entry) => entry.path === METADATA_PATH);
    const originalAudit = reconciliationValue(
      publishedTree.find((entry) => entry.path === METADATA_PATH)
    );
    if (!audit || audit.objectId !== originalAudit.objectId || audit.mode !== originalAudit.mode)
      throw new Error("Permanent migration audit was changed.");
    const domainChanged = domainTree(entries) !== domainTree(previousTree);
    const entry = entries.find((file) => file.path === RECONCILIATION_PATH);
    const previousEntry = previousTree.find((file) => file.path === RECONCILIATION_PATH);
    if ((previousEntry && !entry) || (entry && entry.mode !== "100644"))
      throw new Error("Missing or unsafe shared journal.");
    const journalChanged = entry?.objectId !== previousEntry?.objectId;
    if (domainChanged) {
      if (journalChanged) throw new Error("Domain changes cannot rewrite reconciliation intent.");
      Object.assign(snapshot, await readDomain(entries));
      snapshot.executionState = "fresh_plan_required";
    } else if (journalChanged && entry) {
      const previous = snapshot.record;
      const record = reconciliationRecordSchema.parse(
        JSON.parse((await blob(entry.objectId)).toString("utf8"))
      );
      if (stableJson(record.plan) !== stableJson(previous?.plan)) {
        const expected = createFreshReconciliationRecord(
          snapshot,
          reconciliationValue(record.plan).actor
        );
        if (stableJson({ ...record, writeId: expected.writeId }) !== stableJson(expected))
          throw new Error("Invalid explicit fresh plan.");
        snapshot.executionState = "current_plan";
      } else if (snapshot.executionState !== "current_plan") {
        throw new ReconciliationNeedsAttention("fresh_plan_required");
      }
      snapshot.record = record;
      validateReconciliationRecord(snapshot);
      const retainedLength = previous?.history.length ?? 0;
      if (
        stableJson(record.history.slice(0, retainedLength)) !== stableJson(previous?.history ?? [])
      )
        throw new Error("Permanent reconciliation history was replaced.");
      for (const event of record.history.slice(retainedLength)) {
        if (
          event.observedRevision !== fields[1] ||
          !canRecoverMigration(snapshot.course, snapshot.terms, event.actor)
        )
          throw new Error("Unverified journal actor or revision.");
      }
    }
    snapshot.revision = commit;
    previousTree = entries;
  }
  return snapshot;
};

/** Retained execution authority accepts only journal-only descendants of its explicit plan.
 * History inspection never makes a stale plan executable, even after bytes are restored.
 */
export const readMigrationReconciliationSnapshot = async (
  root: string,
  revision: string
): Promise<ReconciliationSnapshot> => {
  const history = await readMigrationHistorySnapshot(root, revision);
  if (history.executionState !== "current_plan")
    throw new ReconciliationNeedsAttention("fresh_plan_required");
  return history;
};

/** Validate actual isolated workspace bytes before staging. Git mode/path checks remain in the transaction. */
export const validateReconciliationWorkspace = (
  root: string,
  snapshot: ReconciliationSnapshot,
  record: unknown
): void => {
  const parsed = reconciliationRecordSchema.parse(record);
  validateReconciliationRecord({ ...snapshot, record: parsed });
  const actual = reconciliationRecordSchema.parse(
    JSON.parse(fs.readFileSync(path.join(root, RECONCILIATION_PATH), "utf8"))
  );
  if (stableJson(actual) !== stableJson(parsed)) throw new Error("Journal bytes changed.");
  const files: { path: string; sha256: string }[] = [];
  const visit = (directory: string, prefix: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (prefix !== "" || entry.name !== ".git") {
        const relative = `${prefix}${entry.name}`;
        migrationPathSchema.parse(relative);
        if (entry.isDirectory()) visit(path.join(directory, entry.name), `${relative}/`);
        else if (!entry.isFile()) throw new Error("Unsafe reconciliation workspace.");
        else if (relative !== RECONCILIATION_PATH)
          files.push({
            path: relative,
            sha256: bytesHash(fs.readFileSync(path.join(directory, entry.name)))
          });
      }
    }
  };
  visit(root, "");
  files.sort((left, right) => compare(left.path, right.path));
  if (fingerprint(files) !== snapshot.intendedFingerprint)
    throw new Error("Intended reconciliation state changed.");
};
