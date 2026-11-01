import { z } from "zod";
import type { RepositoryPermissionReason } from "./repository-team-permission-boundary.js";
import type { StudentTargetReason } from "./student-repository-target.js";

export const MANAGED_BRANCH_POLICY = Object.freeze({
  allowsForcePushes: false,
  allowsDeletions: false,
  isAdminEnforced: true,
  ordinaryPushesAllowed: true
} as const);
export type ManagedBranchReason =
  | RepositoryPermissionReason
  | StudentTargetReason
  | "invalid_submission_branch"
  | "branch_missing"
  | "default_branch_changed"
  | "branch_identity_changed"
  | "ambiguous_branch_protection"
  | "incomplete_branch_inventory"
  | "incompatible_existing_branch_protection"
  | "unsupported_branch_protection"
  | "unassessed_existing_ruleset"
  | "branch_protection_changed"
  | "branch_protection_unverified"
  | "branch_creation_unresolved"
  | "branch_journal_unavailable";
export class ManagedBranchError extends Error {
  constructor(
    readonly reason: ManagedBranchReason,
    readonly conditions: readonly string[] = [],
    readonly branchName?: string
  ) {
    super(reason);
  }
}
export const branchFailure = (
  reason: ManagedBranchReason,
  conditions: readonly string[] = []
): never => {
  throw new ManagedBranchError(reason, Object.freeze([...conditions]));
};

/** Only literal branch patterns. Special glob syntax is never accepted as an exact target. */
export const isManagedBranchName = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value !== "@" &&
  !/[\s\p{C}~^:?*[\]\\]/u.test(value) &&
  !value.startsWith("/") &&
  !value.endsWith("/") &&
  !value.endsWith(".") &&
  !value.includes("//") &&
  !value.includes("..") &&
  !value.includes("@{") &&
  value.split("/").every((part) => !part.startsWith(".") && !part.endsWith(".lock"));

const count = z.number().int().nonnegative();
export const branchRuleSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  repository: z.object({ databaseId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
  allowsForcePushes: z.boolean(),
  allowsDeletions: z.boolean(),
  isAdminEnforced: z.boolean(),
  blocksCreations: z.boolean(),
  requiresApprovingReviews: z.boolean(),
  requiredApprovingReviewCount: count,
  requiresCodeOwnerReviews: z.boolean(),
  requiresStatusChecks: z.boolean(),
  requiresStrictStatusChecks: z.boolean(),
  requiredStatusCheckContexts: z.array(z.string()),
  requiresCommitSignatures: z.boolean(),
  requiresLinearHistory: z.boolean(),
  requiresConversationResolution: z.boolean(),
  requiresDeployments: z.boolean(),
  requiredDeploymentEnvironments: z.array(z.string()),
  requireLastPushApproval: z.boolean(),
  restrictsPushes: z.boolean(),
  lockBranch: z.boolean(),
  lockAllowsFetchAndMerge: z.boolean(),
  dismissesStaleReviews: z.boolean(),
  restrictsReviewDismissals: z.boolean(),
  bypassForcePushAllowances: z.object({ totalCount: count }),
  pushAllowances: z.object({ totalCount: count }),
  branchProtectionRuleConflicts: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    nodes: z.array(
      z.object({
        branchProtectionRule: z.object({ id: z.string() }),
        conflictingBranchProtectionRule: z.object({ id: z.string() }),
        ref: z.object({ name: z.string(), prefix: z.string() })
      })
    )
  })
});
export type ObservedBranchRule = Readonly<z.infer<typeof branchRuleSchema>>;
export interface ObservedBranchProtection {
  readonly allowsForcePushes: boolean;
  readonly allowsDeletions: boolean;
  readonly isAdminEnforced: boolean;
  readonly ordinaryPushesAllowed: boolean;
  readonly source: "none" | "exact" | "wildcard";
}
export interface BranchPolicyDecision {
  readonly action: "none" | "create" | "update";
  readonly rule?: ObservedBranchRule;
  readonly observed: ObservedBranchProtection;
}

export const branchPolicyConflicts = (rule: ObservedBranchRule): readonly string[] =>
  Object.freeze([
    ...(
      [
        "requiresApprovingReviews",
        "requiresStatusChecks",
        "requiresCommitSignatures",
        "requiresLinearHistory",
        "requiresConversationResolution",
        "requiresDeployments",
        "restrictsPushes",
        "lockBranch"
      ] as const
    ).filter((key) => rule[key]),
    ...(rule.bypassForcePushAllowances.totalCount > 0 ? ["force_push_bypass"] : []),
    ...(rule.pushAllowances.totalCount > 0 ? ["push_allowances"] : [])
  ]);
const satisfies = (rule: ObservedBranchRule): boolean =>
  !rule.allowsForcePushes && !rule.allowsDeletions && rule.isAdminEnforced;

/** Effective identity is GitHub's Ref.branchProtectionRule, never a locally guessed fnmatch winner. */
export const decideManagedBranchPolicy = (
  branch: string,
  rules: readonly ObservedBranchRule[],
  effectiveId: string | null
): BranchPolicyDecision => {
  const exact = rules.filter((rule) => rule.pattern === branch);
  if (exact.length > 1) return branchFailure("ambiguous_branch_protection");
  const effective =
    effectiveId === null ? undefined : rules.find((rule) => rule.id === effectiveId);
  if ((effectiveId !== null && !effective) || (exact[0] && effective?.id !== exact[0].id))
    return branchFailure("ambiguous_branch_protection");
  if (!effective)
    return {
      action: "create",
      observed: {
        allowsForcePushes: true,
        allowsDeletions: true,
        isAdminEnforced: false,
        ordinaryPushesAllowed: true,
        source: "none"
      }
    };
  if (effective.pattern !== branch && !/[*?[\]]/.test(effective.pattern))
    return branchFailure("ambiguous_branch_protection");
  if (effective.branchProtectionRuleConflicts.pageInfo.hasNextPage)
    return branchFailure("incomplete_branch_inventory");
  for (const conflict of effective.branchProtectionRuleConflicts.nodes) {
    if (conflict.ref.prefix !== "refs/heads/") return branchFailure("ambiguous_branch_protection");
    if (conflict.ref.name !== branch) {
      if (effective.pattern === branch) return branchFailure("ambiguous_branch_protection");
      continue;
    }
    const firstId = conflict.branchProtectionRule.id;
    const secondId = conflict.conflictingBranchProtectionRule.id;
    if (firstId === secondId || (firstId !== effective.id && secondId !== effective.id))
      return branchFailure("ambiguous_branch_protection");
    const other = rules.find(
      (value) => value.id === (firstId === effective.id ? secondId : firstId)
    );
    if (
      !other ||
      effective.pattern !== branch ||
      other.pattern === branch ||
      !/[*?[\]]/.test(other.pattern)
    )
      return branchFailure("ambiguous_branch_protection");
  }
  const conflicts = branchPolicyConflicts(effective);
  if (conflicts.length) return branchFailure("incompatible_existing_branch_protection", conflicts);
  const observed: ObservedBranchProtection = Object.freeze({
    allowsForcePushes: effective.allowsForcePushes,
    allowsDeletions: effective.allowsDeletions,
    isAdminEnforced: effective.isAdminEnforced,
    ordinaryPushesAllowed: true,
    source: effective.pattern === branch ? "exact" : "wildcard"
  });
  if (satisfies(effective)) return { action: "none", rule: effective, observed };
  if (effective.pattern === branch) return { action: "update", rule: effective, observed };
  // An exact exception must not erase any other manually configured wildcard setting.
  if (
    effective.blocksCreations ||
    effective.dismissesStaleReviews ||
    effective.restrictsReviewDismissals ||
    effective.lockAllowsFetchAndMerge ||
    effective.requiresCodeOwnerReviews ||
    effective.requireLastPushApproval ||
    effective.requiredApprovingReviewCount > 0 ||
    effective.requiresStrictStatusChecks ||
    effective.requiredStatusCheckContexts.length > 0 ||
    effective.requiredDeploymentEnvironments.length > 0
  )
    return branchFailure("incompatible_existing_branch_protection", [
      "wildcard_override_would_weaken_policy"
    ]);
  return { action: "create", rule: effective, observed };
};
