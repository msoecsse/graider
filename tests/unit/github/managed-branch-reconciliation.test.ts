import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ManagedBranchReconciler } from "../../../src/github/managed-branch-reconciliation.js";
import {
  MANAGED_BRANCH_POLICY,
  type ObservedBranchRule
} from "../../../src/github/managed-branch-policy.js";
import {
  FakeManagedBranchClient,
  fakeBranchRule
} from "../../../src/github/fake-managed-branch-client.js";
import {
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION,
  TERM_LIFECYCLE_STATUSES
} from "../../../src/config/config-schemas.js";
import {
  course,
  term,
  users,
  org,
  REPOSITORY_ID,
  OTHER_REPOSITORY_ID,
  OUTSIDER,
  PAGE_SIZE,
  response
} from "./team-membership-fixtures.js";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const STUDENT_ID = OTHER_REPOSITORY_ID;
const GROUP_ID = OTHER_REPOSITORY_ID + 1;
const student = (id = STUDENT_ID) => ({
  courseRepositoryId: REPOSITORY_ID,
  organizationId: 200,
  repositoryId: id,
  termCode: "27s1",
  sectionId: "001",
  sectionIds: ["001"],
  assignmentSlug: "lab01",
  targetId: `target-${String(id)}`,
  mode: "individual"
});
const fixture = (
  studentTargets: readonly unknown[] = [student(), { ...student(GROUP_ID), mode: "group" }]
) => {
  const client = new FakeManagedBranchClient(users);
  client.organizationMembers.set(org, users);
  for (const id of [REPOSITORY_ID, STUDENT_ID, GROUP_ID]) {
    client.addPermissionRepository(id, org, `arbitrary-${String(id)}`);
    const branch = id === REPOSITORY_ID ? "course-default" : "submission-default";
    client.defaultBranches.set(id, branch);
    client.branches.set(id, new Set([branch]));
  }
  const context = {
    course,
    terms: [term],
    courseRepositoryId: REPOSITORY_ID,
    organizationId: client.organizationId,
    authenticatedUserId: client.accountId,
    studentTargets
  };
  const journal = new Set<string>();
  const service = new ManagedBranchReconciler(client, context, journal);
  const seed = (
    id: number,
    input: Partial<ObservedBranchRule> = {},
    pattern = client.defaultBranches.get(id) ?? "missing"
  ) => {
    const rule = fakeBranchRule(
      id,
      `manual-${String(id)}-${String((client.branchRules.get(id) ?? []).length)}`,
      pattern,
      input
    );
    const rules = client.branchRules.get(id) ?? [];
    rules.push(rule);
    client.branchRules.set(id, rules);
    client.effectiveRules.set(client.key(id, client.defaultBranches.get(id) ?? pattern), rule.id);
    return rule;
  };
  return { client, context, journal, service, seed };
};

describe("minimal managed branch policy", () => {
  it.each(TERM_LIFECYCLE_STATUSES)("preserves Phase 7 branch policy for %s", async (status) => {
    const baseline = fixture();
    const f = fixture();
    const service = new ManagedBranchReconciler(
      f.client,
      {
        ...f.context,
        terms: f.context.terms.map((value) => ({
          ...value,
          term: { ...value.term, status, has_ever_been_active: true }
        }))
      },
      f.journal
    );
    expect(await service.reconcile()).toEqual(await baseline.service.reconcile());
  });

  it("protects course, individual and group defaults without restricting ordinary direct pushes", async () => {
    const f = fixture();
    const before = structuredClone({ course, term });
    const outcomes = await f.service.reconcile();
    expect(outcomes.map((value) => value.status)).toEqual([
      "reconciled",
      "reconciled",
      "reconciled"
    ]);
    expect(outcomes.map((value) => value.repositoryKind)).toEqual([
      "course",
      "individual",
      "group"
    ]);
    expect(
      outcomes.every(
        (value) =>
          value.branchSource === "default" &&
          value.observedProtection?.isAdminEnforced &&
          !value.observedProtection.allowsForcePushes &&
          !value.observedProtection.allowsDeletions &&
          value.observedProtection.ordinaryPushesAllowed
      )
    ).toBe(true);
    expect(outcomes[0]?.branchName).toBe("course-default");
    expect(outcomes[1]?.branchName).toBe("submission-default");
    for (const rule of [...f.client.branchRules.values()].flat()) {
      expect(rule).toMatchObject({
        isAdminEnforced: true,
        allowsForcePushes: false,
        allowsDeletions: false,
        requiresApprovingReviews: false,
        requiresStatusChecks: false,
        restrictsPushes: false,
        lockBranch: false,
        requiresCommitSignatures: false,
        requiresLinearHistory: false,
        requiresConversationResolution: false,
        requiresDeployments: false
      });
      expect(rule.bypassForcePushAllowances.totalCount).toBe(0);
    }
    const repo = f.client.permissionRepositories.get(STUDENT_ID);
    if (!repo) throw new Error("Repository required.");
    expect(
      (await f.client.getManagedBranchProtection(repo.owner.login, repo.name, "submission-default"))
        .data
    ).toMatchObject({
      enforce_admins: { enabled: true },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
      required_pull_request_reviews: null,
      required_status_checks: null,
      restrictions: null
    });
    expect(f.client.updates).toEqual([]);
    expect(f.client.membershipWrites).toEqual([]);
    expect(f.client.teamPermissionWrites).toEqual([]);
    expect(f.client.invitationsCreated).toEqual([]);
    expect({ course, term }).toEqual(before);
    expect(MANAGED_BRANCH_POLICY.isAdminEnforced).toBe(true);
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });

  it("exact compatible rules and complete reruns produce no writes", async () => {
    const f = fixture();
    for (const id of [REPOSITORY_ID, STUDENT_ID, GROUP_ID]) f.seed(id);
    expect((await f.service.reconcile()).every((value) => value.status === "up_to_date")).toBe(
      true
    );
    expect(f.client.creations).toEqual([]);
    expect(f.client.updates).toEqual([]);
    const fresh = fixture();
    await fresh.service.reconcile();
    await fresh.service.reconcile();
    expect(fresh.client.creations).toHaveLength(3);
    expect(fresh.client.updates).toEqual([]);
  });

  it.each(["allowsForcePushes", "allowsDeletions", "admin_bypass"])(
    "tightens exact %s by rule ID and preserves unrelated manual settings",
    async (condition) => {
      const f = fixture();
      const rule = f.seed(STUDENT_ID, {
        blocksCreations: true,
        dismissesStaleReviews: true,
        restrictsReviewDismissals: true,
        ...(condition === "admin_bypass" ? { isAdminEnforced: false } : { [condition]: true })
      });
      const result = (await f.service.reconcile()).find(
        (value) => value.repositoryId === STUDENT_ID
      );
      expect(result).toMatchObject({ status: "reconciled", ruleId: rule.id });
      expect(f.client.updates).toEqual([{ ruleId: rule.id }]);
      expect(f.client.branchRules.get(STUDENT_ID)?.[0]).toMatchObject({
        ...rule,
        allowsForcePushes: false,
        allowsDeletions: false,
        isAdminEnforced: true
      });
      expect(f.client.creations.some((value) => value.repositoryId === STUDENT_ID)).toBe(false);
    }
  );

  it.each([
    "requiresApprovingReviews",
    "requiresStatusChecks",
    "lockBranch",
    "restrictsPushes",
    "requiresCommitSignatures",
    "requiresLinearHistory",
    "requiresDeployments",
    "requiresConversationResolution"
  ] as const)("does not weaken incompatible manual %s", async (key) => {
    const f = fixture();
    const rule = f.seed(STUDENT_ID, { [key]: true });
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)
    ).toMatchObject({
      status: "needs_attention",
      reason: "incompatible_existing_branch_protection",
      conditions: [key]
    });
    expect(f.client.branchRules.get(STUDENT_ID)?.[0]).toEqual(rule);
    expect(f.client.updates).toEqual([]);
    expect(f.client.creations.some((value) => value.repositoryId === STUDENT_ID)).toBe(false);
  });

  it("never creates an automatic force-push bypass or clears a manual bypass list", async () => {
    const f = fixture();
    f.seed(STUDENT_ID, { bypassForcePushAllowances: { totalCount: 1 } });
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.reason
    ).toBe("incompatible_existing_branch_protection");
    expect(f.client.updates).toEqual([]);
  });
});

describe("effective exact/wildcard rules and rulesets", () => {
  it("compatible effective wildcard protection needs no exact rule or wildcard update", async () => {
    const f = fixture();
    const rule = f.seed(STUDENT_ID, {}, "submission-*");
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)
    ).toMatchObject({
      status: "up_to_date",
      ruleId: rule.id,
      observedProtection: { source: "wildcard" }
    });
    expect(f.client.creations.some((value) => value.repositoryId === STUDENT_ID)).toBe(false);
    expect(f.client.updates).toEqual([]);
  });

  it("creates and remotely verifies an exact exception to a weak wildcard without changing other branches", async () => {
    const f = fixture();
    const wildcard = f.seed(
      STUDENT_ID,
      { allowsForcePushes: true, allowsDeletions: true, isAdminEnforced: false },
      "submission-*"
    );
    const create = f.client.createManagedBranchRule.bind(f.client);
    vi.spyOn(f.client, "createManagedBranchRule").mockImplementation(async (...args) => {
      const result = await create(...args);
      if (args[0] === `repository-${String(STUDENT_ID)}`) {
        const exact = f.client.branchRules
          .get(STUDENT_ID)
          ?.find((value) => value.pattern === "submission-default");
        if (!exact) throw new Error("Exact rule required.");
        const rules = f.client.branchRules.get(STUDENT_ID) ?? [];
        f.client.branchRules.set(
          STUDENT_ID,
          rules.map((value) =>
            value.id === exact.id
              ? {
                  ...value,
                  branchProtectionRuleConflicts: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [
                      {
                        branchProtectionRule: { id: exact.id },
                        conflictingBranchProtectionRule: { id: wildcard.id },
                        ref: { name: "submission-default", prefix: "refs/heads/" }
                      }
                    ]
                  }
                }
              : value
          )
        );
      }
      return result;
    });
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)
    ).toMatchObject({ status: "reconciled", observedProtection: { source: "exact" } });
    expect(f.client.branchRules.get(STUDENT_ID)?.find((value) => value.id === wildcard.id)).toEqual(
      wildcard
    );
    expect(f.client.updates).toEqual([]);
  });

  it.each(["requiresApprovingReviews", "blocksCreations"] as const)(
    "does not override a wildcard and weaken manual %s",
    async (key) => {
      const f = fixture();
      const rule = f.seed(STUDENT_ID, { allowsForcePushes: true, [key]: true }, "submission-*");
      expect(
        (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.reason
      ).toBe("incompatible_existing_branch_protection");
      expect(f.client.branchRules.get(STUDENT_ID)).toEqual([rule]);
      expect(f.client.creations.some((value) => value.repositoryId === STUDENT_ID)).toBe(false);
    }
  );

  it.each([
    "duplicate_exact",
    "unidentified_effective",
    "wildcard_conflict",
    "incomplete_conflicts"
  ])("fails closed on %s", async (kind) => {
    const f = fixture();
    const first = f.seed(
      STUDENT_ID,
      {},
      kind === "wildcard_conflict" ? "submission-*" : "submission-default"
    );
    if (kind === "duplicate_exact") f.seed(STUDENT_ID);
    if (kind === "unidentified_effective")
      f.client.effectiveRules.set(f.client.key(STUDENT_ID, "submission-default"), "unknown-id");
    if (kind === "wildcard_conflict") {
      const second = fakeBranchRule(STUDENT_ID, "other-wildcard", "*");
      f.client.branchRules.set(STUDENT_ID, [
        {
          ...first,
          branchProtectionRuleConflicts: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                branchProtectionRule: { id: first.id },
                conflictingBranchProtectionRule: { id: second.id },
                ref: { name: "submission-default", prefix: "refs/heads/" }
              }
            ]
          }
        },
        second
      ]);
    }
    if (kind === "incomplete_conflicts")
      f.client.branchRules.set(STUDENT_ID, [
        {
          ...first,
          branchProtectionRuleConflicts: {
            pageInfo: { hasNextPage: true, endCursor: "next" },
            nodes: []
          }
        }
      ]);
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.status
    ).toBe("needs_attention");
    expect(f.client.updates).toEqual([]);
    expect(f.client.creations.some((value) => value.repositoryId === STUDENT_ID)).toBe(false);
  });

  it.each(["applicable_branch", "push", "unknown_target"])(
    "does not layer protection over unassessed %s rulesets",
    async (kind) => {
      const f = fixture();
      f.client.rulesets.set(STUDENT_ID, [
        {
          id: OUTSIDER,
          target: kind === "push" ? "push" : kind === "unknown_target" ? "unknown" : "branch",
          enforcement: "active"
        }
      ]);
      if (kind === "applicable_branch")
        f.client.effectiveRulesetRules.set(f.client.key(STUDENT_ID, "submission-default"), [
          { type: "non_fast_forward", ruleset_id: OUTSIDER }
        ]);
      expect(
        (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)
      ).toMatchObject({ status: "needs_attention", reason: "unassessed_existing_ruleset" });
      expect(f.client.creations.some((value) => value.repositoryId === STUDENT_ID)).toBe(false);
      expect(f.client.rulesets.get(STUDENT_ID)).toHaveLength(1);
    }
  );

  it("inactive, tag-only and proven nonapplicable branch rulesets are not modified", async () => {
    const f = fixture();
    f.client.rulesets.set(STUDENT_ID, [
      { id: OUTSIDER, target: "branch", enforcement: "disabled" },
      { id: OUTSIDER + 1, target: "tag", enforcement: "active" },
      { id: OUTSIDER + 2, target: "branch", enforcement: "active" }
    ]);
    const before = structuredClone(f.client.rulesets);
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.status
    ).toBe("reconciled");
    expect(f.client.rulesets).toEqual(before);
  });
});

describe("branch targeting and repository trust", () => {
  it("a trusted explicit submission branch overrides default without changing schema", async () => {
    const f = fixture([{ ...student(), submissionBranch: "hand-in/topic" }]);
    f.client.branches.get(STUDENT_ID)?.add("hand-in/topic");
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)
    ).toMatchObject({
      branchName: "hand-in/topic",
      branchSource: "explicit",
      status: "reconciled"
    });
    expect(f.client.creations.find((value) => value.repositoryId === STUDENT_ID)?.branch).toBe(
      "hand-in/topic"
    );
  });

  it("missing explicit/default branches are not recreated or guessed", async () => {
    const f = fixture([{ ...student(), submissionBranch: "missing" }]);
    f.client.branches.get(REPOSITORY_ID)?.clear();
    expect(
      (await f.service.reconcile()).every(
        (value) => value.status === "needs_attention" && value.reason === "branch_missing"
      )
    ).toBe(true);
    expect(f.client.creations).toEqual([]);
  });

  it.each([undefined, "main*", "../wrong", "bad name"])(
    "missing identity or invalid override %s fails closed",
    async (override) => {
      const f = fixture([
        override === undefined
          ? { ...student(), repositoryId: undefined, repositoryName: "matching-name" }
          : { ...student(), submissionBranch: override }
      ]);
      expect((await f.service.reconcile())[1]?.status).toBe("needs_attention");
      expect(f.client.creations.every((value) => value.repositoryId === REPOSITORY_ID)).toBe(true);
    }
  );

  it("cross-section group evidence cannot authorize branch changes", async () => {
    const f = fixture([{ ...student(GROUP_ID), mode: "group", sectionIds: ["001", "002"] }]);
    expect((await f.service.reconcile())[1]?.reason).toBe("cross_section_repository_target");
    expect(f.client.creations.every((value) => value.repositoryId === REPOSITORY_ID)).toBe(true);
  });

  it("repository rename refreshes locators without changing identity", async () => {
    const f = fixture();
    const repo = f.client.permissionRepositories.get(STUDENT_ID);
    if (!repo) throw new Error("Repository required.");
    repo.name = "renamed-repository";
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.status
    ).toBe("reconciled");
  });

  it.each(["transfer", "wrong_id", "account"])(
    "%s blocks unsafe targets independently",
    async (failure) => {
      const f = fixture();
      const repo = f.client.permissionRepositories.get(STUDENT_ID);
      if (!repo) throw new Error("Repository required.");
      if (failure === "transfer") repo.owner.id += 1;
      if (failure === "wrong_id") repo.id += 1;
      if (failure === "account") f.client.accountId += 1;
      const results = await f.service.reconcile();
      expect(results.find((value) => value.repositoryId === STUDENT_ID)?.status).toBe(
        "needs_attention"
      );
      if (failure !== "account")
        expect(results.find((value) => value.repositoryId === GROUP_ID)?.status).toBe("reconciled");
      expect(f.client.creations.some((value) => value.repositoryId === STUDENT_ID)).toBe(false);
    }
  );

  it("default changes between inspection and mutation prevent stale protection", async () => {
    const f = fixture();
    const get = f.client.getCourseRepositoryById.bind(f.client);
    let reads = 0;
    vi.spyOn(f.client, "getCourseRepositoryById").mockImplementation((id) => {
      if (id === REPOSITORY_ID && ++reads === 3) {
        f.client.defaultBranches.set(id, "new-default");
        f.client.branches.get(id)?.add("new-default");
      }
      return get(id);
    });
    const results = await f.service.reconcile();
    expect(results[0]).toMatchObject({
      status: "needs_attention",
      reason: "default_branch_changed"
    });
    expect(f.client.creations.some((value) => value.repositoryId === REPOSITORY_ID)).toBe(false);
    expect(results.find((value) => value.repositoryId === STUDENT_ID)?.status).toBe("reconciled");
  });

  it("explicit branch identity survives a concurrent default-branch change", async () => {
    const f = fixture([{ ...student(), submissionBranch: "hand-in" }]);
    f.client.branches.get(STUDENT_ID)?.add("hand-in");
    const get = f.client.getCourseRepositoryById.bind(f.client);
    let reads = 0;
    vi.spyOn(f.client, "getCourseRepositoryById").mockImplementation((id) => {
      if (id === STUDENT_ID && ++reads === 2) f.client.defaultBranches.set(id, "other-default");
      return get(id);
    });
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)
    ).toMatchObject({ status: "reconciled", branchName: "hand-in" });
  });
});

describe("branch mutation verification, journals and regression", () => {
  it("organization rename keeps canonical identity and leaves persisted metadata unchanged", async () => {
    const f = fixture();
    const before = structuredClone(f.context.course);
    for (const repo of f.client.permissionRepositories.values()) repo.owner.login = "renamed-org";
    f.client.organizationMembers.set("renamed-org", users);
    expect((await f.service.reconcile()).every((value) => value.status === "reconciled")).toBe(
      true
    );
    expect(f.context.course).toEqual(before);
  });

  it("a masked/rate-limited 404 cannot establish missing protection", async () => {
    const f = fixture();
    const get = f.client.getManagedBranchProtection.bind(f.client);
    const studentName = f.client.permissionRepositories.get(STUDENT_ID)?.name;
    vi.spyOn(f.client, "getManagedBranchProtection").mockImplementation((...args) =>
      args[1] === studentName
        ? Promise.resolve(
            response({ message: "Not Found" }, HTTP_NOT_FOUND, { "X-RateLimit-Remaining": "0" })
          )
        : get(...args)
    );
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.reason
    ).toBe("rate_limited");
    expect(f.client.creations.some((value) => value.repositoryId === STUDENT_ID)).toBe(false);
  });
  it("REST effective administrator enforcement must corroborate the GraphQL rule", async () => {
    const f = fixture();
    const read = f.client.getManagedBranchProtection.bind(f.client);
    const repoName = f.client.permissionRepositories.get(STUDENT_ID)?.name;
    vi.spyOn(f.client, "getManagedBranchProtection").mockImplementation(async (...args) => {
      const result = await read(...args);
      return args[1] === repoName && result.status === HTTP_OK
        ? { ...result, data: { ...(result.data as object), enforce_admins: { enabled: false } } }
        : result;
    });
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)
    ).toMatchObject({ status: "needs_attention", reason: "ambiguous_branch_protection" });
  });

  it("create success requires remote observation, not an acknowledgment", async () => {
    const f = fixture();
    const create = f.client.createManagedBranchRule.bind(f.client);
    vi.spyOn(f.client, "createManagedBranchRule").mockImplementation((id, branch) =>
      id === `repository-${String(STUDENT_ID)}`
        ? Promise.resolve(
            response({
              data: {
                createBranchProtectionRule: { branchProtectionRule: { id: "unobserved-rule" } }
              }
            })
          )
        : create(id, branch)
    );
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)
    ).toMatchObject({ status: "needs_attention", reason: "branch_protection_unverified" });
    expect(f.journal.size).toBe(1);
  });

  it.each(["create", "update"])(
    "a lost %s response is recovered only through verified effective policy",
    async (operation) => {
      const f = fixture();
      if (operation === "update") f.seed(STUDENT_ID, { allowsForcePushes: true });
      if (operation === "create") {
        const create = f.client.createManagedBranchRule.bind(f.client);
        vi.spyOn(f.client, "createManagedBranchRule").mockImplementation(async (...args) => {
          const result = await create(...args);
          if (args[0] === `repository-${String(STUDENT_ID)}`)
            throw new Error("provider secret lost response");
          return result;
        });
      } else {
        const update = f.client.tightenManagedBranchRule.bind(f.client);
        vi.spyOn(f.client, "tightenManagedBranchRule").mockImplementation(async (...args) => {
          await update(...args);
          throw new Error("provider secret lost response");
        });
      }
      const outcomes = await f.service.reconcile();
      expect(outcomes.find((value) => value.repositoryId === STUDENT_ID)?.status).toBe(
        "reconciled"
      );
      expect(JSON.stringify(outcomes)).not.toContain("provider secret");
      const creates = f.client.creations.length;
      const updates = f.client.updates.length;
      expect((await f.service.reconcile()).every((value) => value.status === "up_to_date")).toBe(
        true
      );
      expect(f.client.creations).toHaveLength(creates);
      expect(f.client.updates).toHaveLength(updates);
    }
  );

  it("an unresolved create is not repeated after service recreation or account switch", async () => {
    const f = fixture();
    const create = f.client.createManagedBranchRule.bind(f.client);
    const spy = vi
      .spyOn(f.client, "createManagedBranchRule")
      .mockImplementation((id, branch) =>
        id === `repository-${String(STUDENT_ID)}`
          ? Promise.reject(new Error("transport lost"))
          : create(id, branch)
      );
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.status
    ).toBe("needs_attention");
    f.client.accountId += 1;
    const recreated = new ManagedBranchReconciler(
      f.client,
      { ...f.context, authenticatedUserId: f.client.accountId },
      f.journal
    );
    expect(
      (await recreated.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.reason
    ).toBe("branch_creation_unresolved");
    expect(spy.mock.calls.filter(([id]) => id === `repository-${String(STUDENT_ID)}`)).toHaveLength(
      1
    );
  });

  it("an unobserved update remains Needs attention and can be retried on a fresh explicit run", async () => {
    const f = fixture();
    const rule = f.seed(STUDENT_ID, { allowsDeletions: true });
    vi.spyOn(f.client, "tightenManagedBranchRule").mockResolvedValueOnce(
      response({ data: { updateBranchProtectionRule: { branchProtectionRule: { id: rule.id } } } })
    );
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.status
    ).toBe("needs_attention");
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.status
    ).toBe("reconciled");
    expect(f.journal.size).toBe(0);
  });

  it("the exact exception must actually become effective", async () => {
    const f = fixture();
    const wildcard = f.seed(STUDENT_ID, { allowsForcePushes: true }, "submission-*");
    const create = f.client.createManagedBranchRule.bind(f.client);
    vi.spyOn(f.client, "createManagedBranchRule").mockImplementation(async (...args) => {
      const result = await create(...args);
      if (args[0] === `repository-${String(STUDENT_ID)}`)
        f.client.effectiveRules.set(f.client.key(STUDENT_ID, "submission-default"), wildcard.id);
      return result;
    });
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.status
    ).toBe("needs_attention");
    expect(f.journal.size).toBe(1);
  });

  it("multiple exact rules after a lost create response never recover as success", async () => {
    const f = fixture();
    const create = f.client.createManagedBranchRule.bind(f.client);
    vi.spyOn(f.client, "createManagedBranchRule").mockImplementation(async (...args) => {
      const result = await create(...args);
      if (args[0] === `repository-${String(STUDENT_ID)}`) {
        f.seed(STUDENT_ID);
        throw new Error("lost response");
      }
      return result;
    });
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.reason
    ).toBe("ambiguous_branch_protection");
    expect(f.journal.size).toBe(1);
  });

  it("durable journaling is awaited before creation and a journal failure prevents sending", async () => {
    const f = fixture();
    let committed = false;
    const journal = {
      has: () => false,
      add: async () => {
        await Promise.resolve();
        committed = true;
      },
      delete: () => undefined
    };
    const create = f.client.createManagedBranchRule.bind(f.client);
    vi.spyOn(f.client, "createManagedBranchRule").mockImplementation((...args) => {
      expect(committed).toBe(true);
      return create(...args);
    });
    expect(
      (await new ManagedBranchReconciler(f.client, f.context, journal).reconcile()).every(
        (value) => value.status === "reconciled"
      )
    ).toBe(true);
    const other = fixture();
    const failing = {
      has: () => false,
      add: () => Promise.reject(new Error("disk unavailable")),
      delete: () => undefined
    };
    expect(
      (await new ManagedBranchReconciler(other.client, other.context, failing).reconcile()).every(
        (value) => value.reason === "branch_journal_unavailable"
      )
    ).toBe(true);
    expect(other.client.creations).toEqual([]);
  });

  it("default/branch existence are refreshed again after asynchronous journal work", async () => {
    const f = fixture();
    const journal = {
      has: () => false,
      add: () => {
        f.client.defaultBranches.set(REPOSITORY_ID, "changed-default");
        f.client.branches.get(REPOSITORY_ID)?.add("changed-default");
      },
      delete: () => undefined
    };
    const results = await new ManagedBranchReconciler(f.client, f.context, journal).reconcile();
    expect(results[0]?.reason).toBe("default_branch_changed");
    expect(f.client.creations.some((value) => value.repositoryId === REPOSITORY_ID)).toBe(false);
    expect(results[1]?.status).toBe("reconciled");
  });

  it("fully paginates classic rule inventory and inherited ruleset lists", async () => {
    const f = fixture();
    f.client.branchRules.set(
      STUDENT_ID,
      Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
        fakeBranchRule(
          STUDENT_ID,
          `unrelated-${String(index)}`,
          `unrelated-branch-${String(index)}`
        )
      )
    );
    f.client.rulesets.set(
      STUDENT_ID,
      Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({
        id: OUTSIDER + index,
        target: "branch",
        enforcement: "disabled"
      }))
    );
    const classic = vi.spyOn(f.client, "getManagedBranchRulesPage");
    const rulesets = vi.spyOn(f.client, "listManagedBranchRulesetsPage");
    expect(
      (await f.service.reconcile()).find((value) => value.repositoryId === STUDENT_ID)?.status
    ).toBe("reconciled");
    expect(classic.mock.calls.some((call) => call[2] !== null)).toBe(true);
    expect(rulesets.mock.calls.some((call) => call[2] === 2)).toBe(true);
    expect(
      f.client.branchRules
        .get(STUDENT_ID)
        ?.filter((value) => value.pattern.startsWith("unrelated-branch-"))
    ).toHaveLength(PAGE_SIZE + 1);
  });

  it.each(["partial_graphql", "wrong_repository", "unknown_rest"])(
    "unsupported/incomplete %s evidence blocks mutation",
    async (kind) => {
      const f = fixture();
      if (kind !== "unknown_rest") {
        const get = f.client.getManagedBranchRulesPage.bind(f.client);
        vi.spyOn(f.client, "getManagedBranchRulesPage").mockImplementation(async (...args) => {
          const result = await get(...args);
          if (args[0] !== `repository-${String(STUDENT_ID)}`) return result;
          return kind === "partial_graphql"
            ? response({ data: null, errors: [{ message: "private provider body" }] })
            : response({
                data: {
                  node: { databaseId: OUTSIDER, owner: { databaseId: f.client.organizationId } }
                }
              });
        });
      } else {
        f.seed(STUDENT_ID);
        const get = f.client.getManagedBranchProtection.bind(f.client);
        const repoName = f.client.permissionRepositories.get(STUDENT_ID)?.name;
        vi.spyOn(f.client, "getManagedBranchProtection").mockImplementation(async (...args) => {
          const result = await get(...args);
          return args[1] === repoName
            ? {
                ...result,
                data: { ...(result.data as object), unknown_governance: { enabled: true } }
              }
            : result;
        });
      }
      const result = (await f.service.reconcile()).find(
        (value) => value.repositoryId === STUDENT_ID
      );
      expect(result?.status).toBe("needs_attention");
      expect(JSON.stringify(result)).not.toContain("private provider body");
      expect(f.client.creations.some((value) => value.repositoryId === STUDENT_ID)).toBe(false);
    }
  );

  it("no v1 production workflow invokes branch mutation or cleans retired rules", () => {
    for (const file of [
      "src/execution/apply-executor.ts",
      "src/groups/group-target-executor.ts",
      "ui/electron/main.ts",
      "ui/electron/courseSetupService.ts",
      "ui/electron/githubOAuthSession.ts"
    ])
      expect(readFileSync(file, "utf8")).not.toMatch(
        /ManagedBranchReconciler|createManagedBranchRule|tightenManagedBranchRule/
      );
    const source = readFileSync("src/github/managed-branch-reconciliation.ts", "utf8");
    expect(source).not.toMatch(/deleteBranchProtectionRule|delete.*Ruleset|removeCollaborator/);
  });
});
