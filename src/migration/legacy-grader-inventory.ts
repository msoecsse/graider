import type { GitHubOrganizationResponse } from "../github/github-client.js";
import {
  checked,
  object,
  permission,
  positiveId,
  segment
} from "../github/repository-team-permission-boundary.js";
import type { CourseMigrationAnalysis } from "./migration-models.js";
import type { MigrationReviewResult } from "./migration-review-models.js";
import type {
  LegacyGraderFindingCode,
  LegacyGraderInventory,
  LegacyGraderInventoryData,
  LegacyGraderReadClient
} from "./legacy-grader-models.js";
import { compare, freeze, isSha, stableJson } from "./migration-evidence.js";
import { addLegacyFinding, inventoryLegacyRepositoryEvidence } from "./legacy-grader-evidence.js";

const PAGE_SIZE = 100;
const PAGE_LIMIT = 1000;
class InventoryError extends Error {
  constructor(readonly code: LegacyGraderFindingCode) {
    super(code);
  }
}
const fail = (code: LegacyGraderFindingCode): never => {
  throw new InventoryError(code);
};
const sameLogin = (a: unknown, b: string): boolean =>
  typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const validDiscriminators = (
  analysis: { readonly kind: unknown },
  review: { readonly kind: unknown; readonly publicationReady: unknown }
): boolean =>
  analysis.kind === "schema-v1-migration-analysis" &&
  review.kind === "schema-v1-migration-review" &&
  review.publicationReady === false;

/** Fail closed on pagination failures/repeated records; partial lists never prove completeness. */
const readPages = async (
  read: (page: number) => Promise<GitHubOrganizationResponse>
): Promise<Record<string, unknown>[]> => {
  const result: Record<string, unknown>[] = [];
  const ids = new Set<number>();
  for (let page = 1; page <= PAGE_LIMIT; page += 1) {
    const response = await read(page);
    const values = checked(response);
    if (!Array.isArray(values) || values.length > PAGE_SIZE) return fail("observation_incomplete");
    for (const input of values as unknown[]) {
      const item = object(input);
      if (!positiveId(item.id) || ids.has(item.id)) return fail("observation_incomplete");
      ids.add(item.id);
      result.push(item);
    }
    if (
      values.length < PAGE_SIZE &&
      !/rel="next"/.test(new Headers(response.headers).get("link") ?? "")
    )
      return result;
  }
  return fail("observation_incomplete");
};

/**
 * Trusted backend seam: analysis/review must come from the retained getCompleted() context,
 * never deserialized IPC assertions. Observations authorize neither publication nor cleanup.
 * No main/IPC composition is installed by this inventory slice.
 */
export const inventoryLegacyGraders = async (
  trustedAnalysis: CourseMigrationAnalysis,
  trustedReview: MigrationReviewResult,
  client: LegacyGraderReadClient,
  signal: AbortSignal
): Promise<LegacyGraderInventory> => {
  // Detach before awaiting external reads; caller changes cannot retarget the inventory.
  const analysis = structuredClone(trustedAnalysis);
  const review = structuredClone(trustedReview);
  const result: LegacyGraderInventoryData = {
    kind: "schema-v1-legacy-grader-inventory",
    status: "ready",
    publicationReady: false,
    source: { ...analysis.source, reportId: analysis.reportId },
    runtimeCoverage: analysis.runtimeCoverage,
    evidence: analysis.grader.evidence.map((e) => ({ ...e })),
    repositoryEvidence: [],
    candidate: null,
    repositories: [],
    findings: []
  };
  const finding = (code: LegacyGraderFindingCode, location: string, blocking = false): void => {
    addLegacyFinding(result, code, location, blocking ? "blocking" : "unresolved");
  };
  const finish = (): LegacyGraderInventory => {
    result.evidence.sort((a, b) => compare(stableJson(a), stableJson(b)));
    result.findings = [...new Map(result.findings.map((f) => [stableJson(f), f])).values()].sort(
      (a, b) => compare(stableJson(a), stableJson(b))
    );
    if (result.findings.length > 0)
      result.status = result.findings.some((f) => f.classification === "blocking")
        ? "blocked"
        : "needs_attention";
    return freeze(result);
  };
  const binding = {
    repositoryId: analysis.source.repositoryId,
    sourceCommitSha: analysis.source.sourceCommitSha,
    reportId: analysis.reportId,
    authenticatedGithubUserId: analysis.source.authenticatedGithubUserId
  };
  if (
    stableJson(binding) !== stableJson(review.source) ||
    !positiveId(binding.repositoryId) ||
    !positiveId(binding.authenticatedGithubUserId) ||
    !isSha(binding.sourceCommitSha) ||
    !binding.reportId
  ) {
    finding("review_binding_invalid", "review", true);
    return finish();
  }
  if (
    !validDiscriminators(analysis, review) ||
    review.status !== "complete" ||
    !analysis.validatedMigrationFacts ||
    analysis.status === "blocked" ||
    analysis.status === "not_applicable"
  ) {
    finding("review_not_authorized", "review", true);
    return finish();
  }
  const config = analysis.courseConfigurationEvidence?.value;
  if (!config) {
    finding("review_not_authorized", "course.yml", true);
    return finish();
  }
  const slug = config.github.grader_team;
  const debt =
    review.graderDebtPresent ||
    result.evidence.length > 0 ||
    slug !== undefined ||
    config.github.grader_permission !== undefined;
  const organizationId = analysis.source.organizationId;
  const organization = analysis.source.organizationLogin;
  if (
    !positiveId(organizationId) ||
    !sameLogin(config.github.organization, organization) ||
    analysis.organization.value !== "organization_reconciled" ||
    review.organizationCondition !== "organization_reconciled"
  ) {
    finding("organization_identity_conflict", "organization", true);
    return finish();
  }
  if (!debt) {
    result.status = "not_applicable";
    return finish();
  }
  inventoryLegacyRepositoryEvidence(analysis, result);
  if (
    result.evidence.some(
      (e) =>
        (e.team !== null && e.team !== slug) ||
        (e.permission !== null &&
          config.github.grader_permission !== undefined &&
          e.permission !== config.github.grader_permission)
    )
  )
    finding("grader_evidence_conflict", "grader");
  if (slug === undefined || !/^[a-z\d][a-z\d._-]*$/u.test(slug)) {
    finding("team_locator_unresolved", "course.yml#github.grader_team");
    return finish();
  }
  result.candidate = {
    classification: "legacy_candidate",
    organizationId,
    organizationLogin: organization,
    slug,
    teamId: null,
    membershipComplete: false,
    members: []
  };
  const candidate = result.candidate;
  const catchFinding = (error: unknown, location: string, blocking = false): void => {
    finding(
      error instanceof InventoryError ? error.code : "observation_incomplete",
      location,
      blocking
    );
  };
  const verifyAccount = async (): Promise<void> => {
    if (
      object(checked(await client.getOrganizationScopeResponse(signal))).id !==
      binding.authenticatedGithubUserId
    )
      fail("account_identity_conflict");
    const membership = object(
      checked(await client.getOrganizationMembership(organization, signal))
    );
    const org = object(membership.organization);
    if (
      org.id !== organizationId ||
      !sameLogin(org.login, organization) ||
      membership.state !== "active"
    )
      fail("organization_identity_conflict");
    if (
      membership.user !== undefined &&
      object(membership.user).id !== binding.authenticatedGithubUserId
    )
      fail("account_identity_conflict");
  };
  const verifyTeam = async (teamId: number): Promise<void> => {
    const value = object(checked(await client.getManagedTeam(organizationId, teamId, signal)));
    const org = object(value.organization);
    if (
      value.id !== teamId ||
      value.slug !== slug ||
      org.id !== organizationId ||
      !sameLogin(org.login, organization)
    )
      fail("team_identity_conflict");
  };
  try {
    await verifyAccount();
  } catch (error) {
    catchFinding(error, "account/organization", true);
    return finish();
  }
  try {
    const teams = await readPages((page) =>
      client.listManagedOrganizationTeamsPage(organization, page, PAGE_SIZE, signal)
    );
    const matches = teams.filter((t) => t.slug === slug);
    const match = matches[0];
    if (matches.length > 1) finding("team_ambiguous", slug);
    else if (!match) finding("team_missing", slug);
    else if (positiveId(match.id)) {
      await verifyTeam(match.id);
      candidate.teamId = match.id;
    }
  } catch (error) {
    catchFinding(error, slug, true);
  }
  if (candidate.teamId !== null) {
    const teamId = candidate.teamId;
    try {
      const members = await readPages((page) =>
        client.listManagedTeamMembersPage(organizationId, teamId, page, PAGE_SIZE, signal)
      );
      const logins = new Set<string>();
      const projected = members.map((member) => {
        if (!positiveId(member.id)) return fail("member_identity_conflict");
        const login = segment(member.login);
        if (logins.has(login.toLowerCase())) return fail("member_identity_conflict");
        logins.add(login.toLowerCase());
        return { id: member.id, login };
      });
      await verifyTeam(teamId);
      candidate.members = projected.sort((a, b) => a.id - b.id);
      candidate.membershipComplete = true;
    } catch (error) {
      catchFinding(error, `${slug}/members`);
    }
  }
  const readRepository = async (repositoryId: number) => {
    const value = object(checked(await client.getCourseRepositoryById(repositoryId, signal)));
    if (value.id !== repositoryId) fail("repository_identity_conflict");
    const owner = object(value.owner);
    if (
      owner.id !== organizationId ||
      owner.type !== "Organization" ||
      !sameLogin(owner.login, organization) ||
      typeof value.node_id !== "string" ||
      !value.node_id
    )
      fail("repository_identity_conflict");
    return {
      id: repositoryId,
      nodeId: value.node_id,
      owner: segment(owner.login),
      name: segment(value.name)
    };
  };
  for (const repository of result.repositories) {
    try {
      const before = await readRepository(repository.repositoryId);
      repository.owner = before.owner;
      repository.name = before.name;
      const teams = await readPages((page) =>
        client.listCourseRepositoryTeamsPage(before.owner, before.name, page, PAGE_SIZE, signal)
      );
      const slugs = new Set<string>();
      const associations = teams.map((value) => {
        if (!positiveId(value.id)) return fail("team_identity_conflict");
        const observedSlug = segment(value.slug);
        if (
          slugs.has(observedSlug) ||
          (observedSlug === slug && candidate.teamId !== null && value.id !== candidate.teamId) ||
          (value.id === candidate.teamId && observedSlug !== slug)
        )
          return fail("team_identity_conflict");
        slugs.add(observedSlug);
        const parentId = value.parent === null ? null : object(value.parent).id;
        if (parentId !== null && !positiveId(parentId)) return fail("team_identity_conflict");
        const observedPermission = permission(value.permission);
        const roleAliases: Readonly<Record<string, string | undefined>> = {
          read: "pull",
          write: "push",
          pull: "pull",
          push: "push",
          maintain: "maintain",
          triage: "triage",
          admin: "admin"
        };
        if (
          value.role_name !== undefined &&
          (typeof value.role_name !== "string" ||
            roleAliases[value.role_name] !== observedPermission)
        )
          return fail("observation_incomplete");
        return {
          teamId: value.id,
          slug: observedSlug,
          permission: observedPermission,
          parentId,
          legacyCandidate: value.id === candidate.teamId
        };
      });
      const after = await readRepository(repository.repositoryId);
      if (stableJson(before) !== stableJson(after)) fail("repository_identity_conflict");
      repository.associations = associations.sort((a, b) => a.teamId - b.teamId);
      repository.associationsComplete = true;
      const historical = result.evidence.filter(
        (e) =>
          e.provenance !== "course-config" &&
          e.team === slug &&
          repository.evidence.some(
            (r) =>
              e.provenance === `manifest-${r.provenance}` &&
              e.location === `${r.location}#${r.repositoryName}`
          )
      );
      const grant = associations.find((a) => a.legacyCandidate);
      if (
        historical.some(
          (e) => e.permission !== null && e.permission !== (grant?.permission ?? "none")
        )
      )
        finding("grant_evidence_mismatch", `repository:${String(repository.repositoryId)}`);
    } catch (error) {
      catchFinding(error, `repository:${String(repository.repositoryId)}`, true);
    }
  }
  try {
    if (candidate.teamId !== null) await verifyTeam(candidate.teamId);
    await verifyAccount();
  } catch (error) {
    catchFinding(error, "account/organization", true);
    candidate.membershipComplete = false;
    result.repositories.forEach((r) => {
      r.associationsComplete = false;
    });
  }
  return finish();
};
