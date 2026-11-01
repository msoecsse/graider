import type { GitHubManagedBranchClient, GitHubOrganizationResponse } from "./github-client.js";
import type { ObservedBranchRule } from "./managed-branch-policy.js";
import { FakeStudentPermissionClient } from "./fake-student-permission-client.js";

const HTTP_NOT_FOUND = 404;
const HTTP_OK = 200;
const PAGE_SIZE = 100;
export const fakeBranchRule = (
  repositoryId: number,
  id: string,
  pattern: string,
  input: Partial<ObservedBranchRule> = {}
): ObservedBranchRule => ({
  id,
  pattern,
  repository: { databaseId: repositoryId },
  allowsForcePushes: false,
  allowsDeletions: false,
  isAdminEnforced: true,
  blocksCreations: false,
  requiresApprovingReviews: false,
  requiredApprovingReviewCount: 0,
  requiresCodeOwnerReviews: false,
  requiresStatusChecks: false,
  requiresStrictStatusChecks: false,
  requiredStatusCheckContexts: [],
  requiresCommitSignatures: false,
  requiresLinearHistory: false,
  requiresConversationResolution: false,
  requiresDeployments: false,
  requiredDeploymentEnvironments: [],
  requireLastPushApproval: false,
  restrictsPushes: false,
  lockBranch: false,
  lockAllowsFetchAndMerge: false,
  dismissesStaleReviews: false,
  restrictsReviewDismissals: false,
  bypassForcePushAllowances: { totalCount: 0 },
  pushAllowances: { totalCount: 0 },
  branchProtectionRuleConflicts: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
  ...input
});

/** Fake effective-rule identity is explicit; tests never rely on a locally guessed wildcard winner. */
export class FakeManagedBranchClient
  extends FakeStudentPermissionClient
  implements GitHubManagedBranchClient
{
  readonly defaultBranches = new Map<number, string>();
  readonly branches = new Map<number, Set<string>>();
  readonly branchRules = new Map<number, ObservedBranchRule[]>();
  readonly effectiveRules = new Map<string, string>();
  readonly rulesets = new Map<number, unknown[]>();
  readonly effectiveRulesetRules = new Map<string, unknown[]>();
  readonly creations: { repositoryId: number; branch: string; ruleId: string }[] = [];
  readonly updates: { ruleId: string }[] = [];
  private nextRule = 1;
  key(repositoryId: number, branch: string): string {
    return JSON.stringify([repositoryId, branch]);
  }
  private branchResponse(data: unknown, status = HTTP_OK): GitHubOrganizationResponse {
    return { status, headers: {}, data: structuredClone(data) };
  }
  override async getCourseRepositoryById(
    repositoryId: number
  ): Promise<GitHubOrganizationResponse> {
    const response = await super.getCourseRepositoryById(repositoryId);
    return response.status === HTTP_OK
      ? {
          ...response,
          data: {
            ...(response.data as object),
            default_branch: this.defaultBranches.get(repositoryId)
          }
        }
      : response;
  }
  getManagedBranchRulesPage(
    repositoryNodeId: string,
    branch: string,
    cursor: string | null
  ): Promise<GitHubOrganizationResponse> {
    const repo = [...this.permissionRepositories.values()].find(
      (value) => value.node_id === repositoryNodeId
    );
    if (!repo) return Promise.resolve(this.branchResponse({}, HTTP_NOT_FOUND));
    const rules = this.branchRules.get(repo.id) ?? [];
    const start = cursor === null ? 0 : Number(cursor);
    const next = start + PAGE_SIZE;
    const effective = this.effectiveRules.get(this.key(repo.id, branch));
    return Promise.resolve(
      this.branchResponse({
        data: {
          node: {
            databaseId: repo.id,
            owner: { databaseId: repo.owner.id },
            defaultBranchRef: { name: this.defaultBranches.get(repo.id), prefix: "refs/heads/" },
            ref: this.branches.get(repo.id)?.has(branch)
              ? {
                  id: this.key(repo.id, branch),
                  name: branch,
                  prefix: "refs/heads/",
                  branchProtectionRule: effective ? { id: effective } : null
                }
              : null,
            branchProtectionRules: {
              nodes: rules.slice(start, next),
              pageInfo: {
                hasNextPage: next < rules.length,
                endCursor: next < rules.length ? String(next) : null
              }
            }
          }
        }
      })
    );
  }
  getManagedBranchProtection(
    owner: string,
    repoName: string,
    branch: string
  ): Promise<GitHubOrganizationResponse> {
    const repo = [...this.permissionRepositories.values()].find(
      (value) => value.owner.login === owner && value.name === repoName
    );
    const rule = repo
      ? (this.branchRules.get(repo.id) ?? []).find(
          (value) => value.id === this.effectiveRules.get(this.key(repo.id, branch))
        )
      : undefined;
    return Promise.resolve(
      rule
        ? this.branchResponse({
            enforce_admins: { enabled: rule.isAdminEnforced },
            allow_force_pushes: { enabled: rule.allowsForcePushes },
            allow_deletions: { enabled: rule.allowsDeletions },
            required_pull_request_reviews: rule.requiresApprovingReviews
              ? { required_approving_review_count: rule.requiredApprovingReviewCount }
              : null,
            required_status_checks: rule.requiresStatusChecks
              ? { contexts: rule.requiredStatusCheckContexts }
              : null,
            restrictions: rule.restrictsPushes ? { users: [] } : null,
            lock_branch: { enabled: rule.lockBranch }
          })
        : this.branchResponse({}, HTTP_NOT_FOUND)
    );
  }
  listManagedBranchRulesetsPage(
    owner: string,
    repoName: string,
    page: number,
    perPage: number
  ): Promise<GitHubOrganizationResponse> {
    const repo = [...this.permissionRepositories.values()].find(
      (value) => value.owner.login === owner && value.name === repoName
    );
    return Promise.resolve(
      repo
        ? this.branchResponse(
            (this.rulesets.get(repo.id) ?? []).slice((page - 1) * perPage, page * perPage)
          )
        : this.branchResponse({}, HTTP_NOT_FOUND)
    );
  }
  listManagedEffectiveBranchRulesPage(
    owner: string,
    repoName: string,
    branch: string,
    page: number,
    perPage: number
  ): Promise<GitHubOrganizationResponse> {
    const repo = [...this.permissionRepositories.values()].find(
      (value) => value.owner.login === owner && value.name === repoName
    );
    return Promise.resolve(
      repo
        ? this.branchResponse(
            (this.effectiveRulesetRules.get(this.key(repo.id, branch)) ?? []).slice(
              (page - 1) * perPage,
              page * perPage
            )
          )
        : this.branchResponse({}, HTTP_NOT_FOUND)
    );
  }
  createManagedBranchRule(
    repositoryNodeId: string,
    branch: string
  ): Promise<GitHubOrganizationResponse> {
    const repo = [...this.permissionRepositories.values()].find(
      (value) => value.node_id === repositoryNodeId
    );
    if (!repo) return Promise.resolve(this.branchResponse({}, HTTP_NOT_FOUND));
    const id = `rule-${String(this.nextRule++)}`;
    const rules = this.branchRules.get(repo.id) ?? [];
    rules.push(fakeBranchRule(repo.id, id, branch));
    this.branchRules.set(repo.id, rules);
    this.effectiveRules.set(this.key(repo.id, branch), id);
    this.creations.push({ repositoryId: repo.id, branch, ruleId: id });
    return Promise.resolve(
      this.branchResponse({
        data: { createBranchProtectionRule: { branchProtectionRule: { id } } }
      })
    );
  }
  tightenManagedBranchRule(ruleId: string): Promise<GitHubOrganizationResponse> {
    for (const [repoId, rules] of this.branchRules) {
      const index = rules.findIndex((value) => value.id === ruleId);
      const rule = rules[index];
      if (!rule) continue;
      rules[index] = {
        ...rule,
        allowsForcePushes: false,
        allowsDeletions: false,
        isAdminEnforced: true
      };
      this.branchRules.set(repoId, rules);
      this.updates.push({ ruleId });
      return Promise.resolve(
        this.branchResponse({
          data: { updateBranchProtectionRule: { branchProtectionRule: { id: ruleId } } }
        })
      );
    }
    return Promise.resolve(this.branchResponse({}, HTTP_NOT_FOUND));
  }
}
