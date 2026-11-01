import { z } from "zod";
import { rawTermConfigV2Schema, TERM_CODE_PATTERN } from "../config/config-schemas.js";
import type { GitHubTeam } from "./github-models.js";

export const GRAIDER_TEAM_METADATA_VERSION = 1;
const MARKER_PREFIX = "graider-team:";
const githubResourceIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const courseFields = { courseRepositoryId: githubResourceIdSchema };
const termFields = { ...courseFields, termCode: z.string().length(4).regex(TERM_CODE_PATTERN) };

const managedTeamIdentitySchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...courseFields,
      kind: z.enum(["course-read", "course-write", "course-current-coordinators"])
    })
    .strict(),
  z
    .object({
      ...termFields,
      kind: z.enum(["term-current-coordinators", "term-former-coordinators"])
    })
    .strict(),
  z
    .object({
      ...termFields,
      kind: z.enum(["section-current-faculty", "section-former-faculty"]),
      // Preserve the term model's opaque, nonempty section IDs, including leading zeroes.
      sectionId: rawTermConfigV2Schema.shape.sections.element.shape.id
    })
    .strict()
]);

export type ManagedTeamIdentity = Readonly<z.infer<typeof managedTeamIdentitySchema>>;
export type ManagedTeamKind = ManagedTeamIdentity["kind"];

/** The repository ID comes from trusted outer course context, never a guessed YAML locator. */
export const createManagedTeamIdentity = (input: unknown): ManagedTeamIdentity =>
  Object.freeze(managedTeamIdentitySchema.parse(input));

/** Canonical whole-description marker. Fixed field order also provides a logical identity key. */
export const renderManagedTeamMetadata = (identity: ManagedTeamIdentity): string => {
  const value = createManagedTeamIdentity(identity);
  return `${MARKER_PREFIX}v${String(GRAIDER_TEAM_METADATA_VERSION)}:${JSON.stringify({
    courseRepositoryId: value.courseRepositoryId,
    kind: value.kind,
    ...("termCode" in value ? { termCode: value.termCode } : {}),
    ...("sectionId" in value ? { sectionId: value.sectionId } : {})
  })}`;
};

export type ManagedTeamMetadata =
  | { readonly classification: "managed"; readonly identity: ManagedTeamIdentity }
  | { readonly classification: "unmanaged" }
  | { readonly classification: "malformed_metadata" }
  | { readonly classification: "unsupported_metadata_version"; readonly metadataVersion: string };

/**
 * One authoritative parser; names/slugs are never consulted. Only canonical v1 markers
 * are accepted, rejecting duplicate JSON keys, extra fields, trailing text and mixed markers.
 * Unknown versions are opaque and must never be interpreted using the v1 payload rules.
 */
export const parseManagedTeamMetadata = (
  description: string | null | undefined
): ManagedTeamMetadata => {
  if (description === null || description === undefined || !description.includes(MARKER_PREFIX)) {
    return { classification: "unmanaged" };
  }
  const header = /^graider-team:v([1-9][0-9]*):/u.exec(description);
  const metadataVersion = header?.[1];
  if (header === null || metadataVersion === undefined) {
    return { classification: "malformed_metadata" };
  }
  if (metadataVersion !== String(GRAIDER_TEAM_METADATA_VERSION)) {
    return { classification: "unsupported_metadata_version", metadataVersion };
  }
  try {
    const payload: unknown = JSON.parse(description.slice(header[0].length));
    const identity = createManagedTeamIdentity(payload);
    if (renderManagedTeamMetadata(identity) !== description) {
      return { classification: "malformed_metadata" };
    }
    return { classification: "managed", identity };
  } catch {
    return { classification: "malformed_metadata" };
  }
};

/** Logical role/scope and concrete immutable GitHub resource identity stay separate. */
export interface ObservedManagedTeam {
  readonly identity: ManagedTeamIdentity;
  readonly team: Readonly<GitHubTeam> & { readonly id: number };
}

export type ManagedTeamClassification =
  | ({ readonly classification: "managed_for_course" } & ObservedManagedTeam)
  | ({ readonly classification: "managed_for_other_course" } & ObservedManagedTeam)
  | Exclude<ManagedTeamMetadata, { readonly classification: "managed" }>
  | { readonly classification: "invalid_team_resource" };

/** Recognition only, not a mutation authorization or a uniqueness guarantee. */
export const classifyManagedTeam = (
  team: GitHubTeam,
  selectedCourseRepositoryId: number
): ManagedTeamClassification => {
  githubResourceIdSchema.parse(selectedCourseRepositoryId);
  const metadata = parseManagedTeamMetadata(team.description);
  if (metadata.classification !== "managed") return metadata;
  const id = githubResourceIdSchema.safeParse(team.id);
  if (!id.success) return { classification: "invalid_team_resource" };
  return {
    classification:
      metadata.identity.courseRepositoryId === selectedCourseRepositoryId
        ? "managed_for_course"
        : "managed_for_other_course",
    identity: metadata.identity,
    team: Object.freeze({ ...team, id: id.data })
  };
};

export interface ManagedTeamConflict {
  readonly status: "needs_attention";
  readonly reason: "duplicate_managed_team_identity";
  readonly identity: ManagedTeamIdentity;
  /** Every distinct claiming resource, with no preferred team or automatic resolution. */
  readonly teams: readonly ObservedManagedTeam[];
}

/** Pure selected-course conflict detection. Repeated observations of one ID aren't two teams. */
export const findDuplicateManagedTeams = (
  teams: readonly GitHubTeam[],
  selectedCourseRepositoryId: number
): readonly ManagedTeamConflict[] => {
  githubResourceIdSchema.parse(selectedCourseRepositoryId);
  const claims = new Map<string, Map<number, ObservedManagedTeam>>();
  for (const team of teams) {
    const observed = classifyManagedTeam(team, selectedCourseRepositoryId);
    if (observed.classification !== "managed_for_course") continue;
    const key = renderManagedTeamMetadata(observed.identity);
    const group = claims.get(key) ?? new Map<number, ObservedManagedTeam>();
    group.set(
      observed.team.id,
      Object.freeze({ identity: observed.identity, team: observed.team })
    );
    claims.set(key, group);
  }
  return Object.freeze(
    [...claims.values()]
      .filter((group) => group.size > 1)
      .map((group): ManagedTeamConflict => {
        const observed = [...group.values()];
        // A conflict always has at least two entries.
        const first = observed[0];
        if (first === undefined) throw new Error("A managed team conflict requires observations.");
        return Object.freeze({
          status: "needs_attention",
          reason: "duplicate_managed_team_identity",
          identity: first.identity,
          teams: Object.freeze(observed)
        });
      })
  );
};
