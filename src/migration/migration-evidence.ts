import { createHash } from "node:crypto";
import type { FacultyIdentity } from "../config/config-models.js";
import { facultyIdentitySchema } from "../config/config-schemas.js";
import type {
  FacultyMigrationInventory,
  FacultyReference,
  Immutable,
  MigrationFact,
  MigrationSnapshot,
  MigrationIssue
} from "./migration-models.js";

/** Stable object keys, preserving meaningful array/history ordering. */
export const stableJson = (value: unknown): string => {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => compare(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
export const fingerprint = (value: unknown): string =>
  createHash("sha256").update(stableJson(value)).digest("hex");
export const textHash = (value: string): string => createHash("sha256").update(value).digest("hex");
export const bytesHash = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const BEFORE = -1;
export const compare = (a: string, b: string): number => (a < b ? BEFORE : a > b ? 1 : 0);
export const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compare);
export const freeze = <T>(value: T): Immutable<T> => {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((item: unknown) => freeze(item));
    Object.freeze(value);
  }
  return value as Immutable<T>;
};
export const fact = <T>(
  classification: MigrationFact<T>["classification"],
  value: T,
  ...evidence: string[]
): MigrationFact<T> => ({ classification, value, evidence });
export const isId = (id: number | undefined): boolean =>
  id !== undefined && Number.isSafeInteger(id) && id > 0;
export const isSha = (sha: string): boolean => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(sha);
export const isSafeRelativePath = (file: string): boolean =>
  !file.includes("\\") &&
  !file.includes(":") &&
  !/[\p{C}]/u.test(file) &&
  file.split("/").every((part) => part !== "" && part !== "." && part !== "..");

export const inventoryFaculty = (
  references: FacultyReference[],
  input: MigrationSnapshot,
  issues: MigrationIssue[]
): FacultyMigrationInventory[] => {
  // V1 scope uses includes() with exact institutional strings: do not lowercase or trim.
  const usernames = sortedUnique(references.map((reference) => reference.originalSpelling));
  const result = usernames.map((username): FacultyMigrationInventory => {
    const trusted = [...(input.trustedIdentities ?? [])]
      .filter((item) => item.institutionalUsername === username)
      .sort((a, b) => compare(stableJson(a), stableJson(b)));
    const ids = new Set(trusted.map((item) => item.githubUserId));
    const currentLogins = sortedUnique(trusted.map((item) => item.githubLogin));
    let identity: FacultyIdentity | null = null;
    let classification: MigrationFact<FacultyIdentity | null>["classification"] = "unresolved";
    if (ids.size > 1) {
      classification = "blocking";
      issues.push({
        code: "identity_conflict",
        classification,
        location: username,
        message: "Trusted mappings identify different immutable GitHub user IDs."
      });
    } else if (trusted.length > 0) {
      // Same-ID renames are one person. Multiple competing current logins need review,
      // unless the evidence explicitly establishes which observations are historical.
      const current = currentLogins.filter(
        (login) => !trusted.some((item) => item.githubLoginHistory?.includes(login))
      );
      const login = current[0];
      const parsed = facultyIdentitySchema.safeParse({
        institutional_username: username,
        github_user_id: trusted[0]?.githubUserId,
        github_login: login,
        github_login_history: sortedUnique(
          trusted.flatMap((item) => [...(item.githubLoginHistory ?? []), item.githubLogin])
        ).filter((item) => item !== login)
      });
      if (
        current.length === 1 &&
        parsed.success &&
        trusted.every(
          (item) =>
            item.reference.length > 0 &&
            (item.provenance !== "authenticated-identity" ||
              item.githubUserId === input.binding.authenticatedGithubUserId)
        )
      ) {
        identity = parsed.data;
        classification = "derived";
      } else {
        issues.push({
          code: "identity_evidence_needs_review",
          classification: "unresolved",
          location: username,
          message: "Trusted identity evidence is invalid or its current login is ambiguous."
        });
      }
    }
    return {
      institutionalUsername: username,
      originalSpellings: [username],
      references: references
        .filter((item) => item.originalSpelling === username)
        .sort((a, b) => compare(stableJson(a), stableJson(b))),
      resolution: fact(
        classification,
        identity,
        ...trusted.map((item) => `${item.provenance}:${item.reference}`)
      ),
      trustedEvidence: structuredClone(trusted),
      suggestions: [...(input.suggestions ?? [])]
        .filter((item) => item.institutionalUsername === username)
        .sort((a, b) => compare(stableJson(a), stableJson(b)))
        .map((item) => ({ ...item, classification: "requires_confirmation" }))
    };
  });
  const collisions = result.filter((record) => {
    const other = result.find(
      (candidate) =>
        candidate !== record &&
        (candidate.institutionalUsername.toLowerCase() ===
          record.institutionalUsername.toLowerCase() ||
          (record.resolution.value !== null &&
            candidate.resolution.value !== null &&
            (record.resolution.value.github_user_id === candidate.resolution.value.github_user_id ||
              record.resolution.value.github_login.toLowerCase() ===
                candidate.resolution.value.github_login.toLowerCase())))
    );
    return other !== undefined;
  });
  for (const record of collisions) {
    issues.push({
      code: "faculty_directory_collision",
      classification: "blocking",
      location: record.institutionalUsername,
      message:
        "Distinct v1 references collide in the v2 faculty directory; explicit resolution is required."
    });
    record.resolution = fact(
      "blocking",
      null,
      "v1-exact-username-semantics",
      "v2-directory-uniqueness"
    );
  }
  return result;
};

export const creationOrderEvidence = (input: MigrationSnapshot, codes: string[]) => {
  const unknown = { order: null, firstCommits: [] } as {
    order: string[] | null;
    firstCommits: Array<{ termCode: string; firstCommitSha: string }>;
  };
  const history = input.history;
  if (!history?.complete || history.sourceCommitSha !== input.binding.sourceCommitSha)
    return unknown;
  const commits = new Map(history.commits.map((commit) => [commit.sha, commit]));
  if (commits.size !== history.commits.length || !commits.has(history.sourceCommitSha))
    return unknown;
  // Iterative traversal avoids call-stack failure on long-lived course histories.
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const pending: Array<{ sha: string; exiting: boolean }> = [
    { sha: history.sourceCommitSha, exiting: false }
  ];
  while (pending.length > 0) {
    const frame = pending.pop();
    if (frame === undefined) break;
    if (frame.exiting) {
      visiting.delete(frame.sha);
      visited.add(frame.sha);
      continue;
    }
    if (visited.has(frame.sha)) continue;
    if (visiting.has(frame.sha)) return unknown;
    const commit = commits.get(frame.sha);
    if (!commit || !isSha(frame.sha)) return unknown;
    visiting.add(frame.sha);
    pending.push({ sha: frame.sha, exiting: true });
    pending.push(...commit.parents.map((sha) => ({ sha, exiting: false })));
  }
  if (visited.size !== commits.size) return unknown;
  if (
    stableJson(sortedUnique(commits.get(history.sourceCommitSha)?.termCodes ?? [])) !==
    stableJson(codes)
  )
    return unknown;
  const ancestor = (older: string, newer: string): boolean => {
    const pending = [...(commits.get(newer)?.parents ?? [])];
    const seen = new Set<string>();
    while (pending.length) {
      const sha = pending.pop();
      if (sha === undefined || seen.has(sha)) continue;
      if (sha === older) return true;
      seen.add(sha);
      pending.push(...(commits.get(sha)?.parents ?? []));
    }
    return false;
  };
  const firstCommits: typeof unknown.firstCommits = [];
  for (const termCode of codes) {
    const introductions = history.commits.filter(
      (commit) =>
        commit.termCodes.includes(termCode) &&
        commit.parents.every((parent) => !commits.get(parent)?.termCodes.includes(termCode))
    );
    const removed = history.commits.some(
      (commit) =>
        !commit.termCodes.includes(termCode) &&
        commit.parents.some((parent) => commits.get(parent)?.termCodes.includes(termCode))
    );
    if (removed || introductions.length !== 1) return unknown;
    const first = introductions[0];
    if (first) firstCommits.push({ termCode, firstCommitSha: first.sha });
  }
  for (const a of firstCommits)
    for (const b of firstCommits) {
      if (
        a !== b &&
        (a.firstCommitSha === b.firstCommitSha ||
          (!ancestor(a.firstCommitSha, b.firstCommitSha) &&
            !ancestor(b.firstCommitSha, a.firstCommitSha)))
      )
        return unknown;
    }
  const order = [...firstCommits]
    .sort((a, b) => (ancestor(a.firstCommitSha, b.firstCommitSha) ? BEFORE : 1))
    .map((item) => item.termCode);
  return { order, firstCommits };
};
