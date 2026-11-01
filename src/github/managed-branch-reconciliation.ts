import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import type { GitHubManagedBranchClient, GitHubOrganizationResponse } from "./github-client.js";
import type { FacultyInvitationJournal } from "./faculty-organization-access.js";
import {
  checked,
  object,
  positiveId,
  reasonFor,
  resolvePermissionRepository,
  type PermissionRepository
} from "./repository-team-permission-boundary.js";
import {
  validateStudentRepositoryTargets,
  type TrustedStudentRepositoryTarget
} from "./student-repository-target.js";
import {
  branchFailure,
  branchRuleSchema,
  decideManagedBranchPolicy,
  isManagedBranchName,
  MANAGED_BRANCH_POLICY,
  ManagedBranchError,
  type ManagedBranchReason,
  type ObservedBranchRule,
  type ObservedBranchProtection,
  type BranchPolicyDecision
} from "./managed-branch-policy.js";

const TIMEOUT_MS = 30_000;
const PAGE_SIZE = 100;
const PAGE_LIMIT = 1000;
const HTTP_NOT_FOUND = 404;

interface BranchTarget {
  readonly repositoryId: number;
  readonly repositoryKind: "course" | "individual" | "group";
  readonly student?: TrustedStudentRepositoryTarget;
  readonly submissionBranch?: string;
}
export interface ManagedBranchOutcome {
  readonly repositoryId: number | null;
  readonly repositoryKind: "course" | "individual" | "group" | null;
  readonly termCode?: string | null;
  readonly sectionId?: string | null;
  readonly assignmentSlug?: string;
  readonly targetId?: string | null;
  readonly branchName: string | null;
  readonly branchSource: "default" | "explicit";
  readonly desiredProtection: typeof MANAGED_BRANCH_POLICY;
  readonly observedProtection: ObservedBranchProtection | null;
  readonly status: "up_to_date" | "reconciled" | "needs_attention";
  readonly ruleId?: string;
  readonly reason?: ManagedBranchReason;
  readonly conditions?: readonly string[];
}
interface BranchSnapshot {
  readonly repo: PermissionRepository;
  readonly branch: string;
  readonly refId: string;
  readonly rules: readonly ObservedBranchRule[];
  readonly effectiveId: string | null;
  readonly decision: BranchPolicyDecision;
}
const why = (error: unknown): ManagedBranchReason =>
  error instanceof ManagedBranchError ? error.reason : reasonFor(error);
const text = (value: unknown): string => {
  if (typeof value !== "string" || !value) return branchFailure("unexpected_response");
  return value;
};

/** Backend-only final Phase 7 policy. No production caller/IPC is added.
 * The outer caller binds source revision, AuthorizationResolver, selected OAuth session,
 * canonical course/org IDs, complete v2 term state and trusted 7.5 ID→scope evidence.
 * submissionBranch is execution-only trusted input; no assignment schema field is introduced.
 * It must retain a durable journal across instances/account changes and serialize writers.
 */
export class ManagedBranchReconciler {
  private readonly context: {
    readonly courseRepositoryId: number;
    readonly organizationId: number;
    readonly authenticatedUserId: number;
  };
  private readonly students: readonly (BranchTarget | ManagedBranchOutcome)[];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: GitHubManagedBranchClient,
    context: {
      readonly course: RawCourseConfigV2;
      readonly terms: readonly RawTermConfigV2[];
      readonly courseRepositoryId: number;
      readonly organizationId: number;
      readonly authenticatedUserId: number;
      readonly studentTargets: readonly unknown[];
    },
    private readonly creationJournal: FacultyInvitationJournal
  ) {
    rawCourseConfigV2Schema.parse(context.course);
    if (
      ![context.courseRepositoryId, context.organizationId, context.authenticatedUserId].every(
        positiveId
      )
    )
      throw new Error("Invalid trusted repository/organization/account identity.");
    this.context = Object.freeze({
      courseRepositoryId: context.courseRepositoryId,
      organizationId: context.organizationId,
      authenticatedUserId: context.authenticatedUserId
    });
    const scopes = new Set<string>();
    const codes = new Set<string>();
    for (const input of context.terms) {
      const term = rawTermConfigV2Schema.parse(input);
      if (codes.has(term.term.code)) throw new Error("Duplicate supplied term scope.");
      codes.add(term.term.code);
      for (const section of term.sections) {
        const scope = JSON.stringify([term.term.code, section.id]);
        if (scopes.has(scope)) throw new Error("Duplicate supplied section scope.");
        scopes.add(scope);
      }
    }
    const overrides = context.studentTargets.map((input) =>
      input && typeof input === "object"
        ? (input as Record<string, unknown>).submissionBranch
        : undefined
    );
    const inputs = context.studentTargets.map((input) => {
      if (!input || typeof input !== "object" || Array.isArray(input)) return input;
      const target = { ...(input as Record<string, unknown>) };
      delete target.submissionBranch;
      return target;
    });
    this.students = Object.freeze(
      validateStudentRepositoryTargets(inputs).map((value, index) => {
        const override = overrides[index];
        const input = context.studentTargets[index];
        const kind =
          input &&
          typeof input === "object" &&
          "mode" in input &&
          (input.mode === "individual" || input.mode === "group")
            ? input.mode
            : null;
        const branchSource = override === undefined ? "default" : "explicit";
        if (value.status === "needs_attention")
          return Object.freeze({
            ...value,
            repositoryKind: kind,
            branchName: null,
            branchSource,
            desiredProtection: MANAGED_BRANCH_POLICY,
            observedProtection: null
          });
        const target = value.target;
        const reason =
          target.courseRepositoryId !== context.courseRepositoryId ||
          target.organizationId !== context.organizationId
            ? "target_context_mismatch"
            : target.repositoryId === context.courseRepositoryId
              ? "course_repository_is_not_student_target"
              : !scopes.has(JSON.stringify([target.termCode, target.sectionId]))
                ? "unknown_target_scope"
                : override !== undefined && !isManagedBranchName(override)
                  ? "invalid_submission_branch"
                  : undefined;
        const managed: BranchTarget = Object.freeze({
          repositoryId: target.repositoryId,
          repositoryKind: target.mode,
          student: target,
          ...(typeof override === "string" ? { submissionBranch: override } : {})
        });
        return reason ? this.failure(managed, new ManagedBranchError(reason)) : managed;
      })
    );
  }

  reconcile(signal = AbortSignal.timeout(TIMEOUT_MS)): Promise<readonly ManagedBranchOutcome[]> {
    const operation = this.queue.then(async () => {
      const results = [
        await this.reconcileTarget(
          { repositoryId: this.context.courseRepositoryId, repositoryKind: "course" },
          signal
        )
      ];
      for (const target of this.students)
        results.push("status" in target ? target : await this.reconcileTarget(target, signal));
      return Object.freeze(results);
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private base(
    target: BranchTarget
  ): Omit<ManagedBranchOutcome, "branchName" | "observedProtection" | "status"> {
    return {
      repositoryId: target.repositoryId,
      repositoryKind: target.repositoryKind,
      branchSource: target.submissionBranch === undefined ? "default" : "explicit",
      desiredProtection: MANAGED_BRANCH_POLICY,
      ...(target.student
        ? {
            termCode: target.student.termCode,
            sectionId: target.student.sectionId,
            assignmentSlug: target.student.assignmentSlug,
            targetId: target.student.targetId
          }
        : {})
    };
  }
  private failure(
    target: BranchTarget,
    error: unknown,
    snapshot?: BranchSnapshot,
    unknown = false
  ): ManagedBranchOutcome {
    return Object.freeze({
      ...this.base(target),
      branchName:
        snapshot?.branch ??
        (error instanceof ManagedBranchError ? error.branchName : undefined) ??
        target.submissionBranch ??
        null,
      observedProtection: unknown ? null : (snapshot?.decision.observed ?? null),
      ...(snapshot?.decision.rule ? { ruleId: snapshot.decision.rule.id } : {}),
      status: "needs_attention",
      reason: why(error),
      ...(error instanceof ManagedBranchError && error.conditions.length
        ? { conditions: error.conditions }
        : {})
    });
  }

  private async repository(
    target: BranchTarget,
    signal: AbortSignal
  ): Promise<PermissionRepository> {
    if (target.repositoryKind !== "course")
      await resolvePermissionRepository(
        this.client,
        this.context,
        this.context.courseRepositoryId,
        signal
      );
    return resolvePermissionRepository(this.client, this.context, target.repositoryId, signal);
  }

  private async pages(
    read: (page: number) => Promise<GitHubOrganizationResponse>
  ): Promise<unknown[]> {
    const result: unknown[] = [];
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const response = await read(page);
      const values = checked(response);
      if (!Array.isArray(values) || values.length > PAGE_SIZE)
        return branchFailure("unexpected_response");
      result.push(...(values as unknown[]));
      if (
        values.length < PAGE_SIZE &&
        !/rel="next"/.test(new Headers(response.headers).get("link") ?? "")
      )
        return result;
    }
    return branchFailure("incomplete_branch_inventory");
  }

  private async checkRulesets(
    repo: PermissionRepository,
    branch: string,
    signal: AbortSignal
  ): Promise<void> {
    const rulesets = await this.pages((page) =>
      this.client.listManagedBranchRulesetsPage(repo.owner, repo.name, page, PAGE_SIZE, signal)
    );
    for (const input of rulesets) {
      const rule = object(input);
      if (
        !positiveId(rule.id) ||
        !["active", "evaluate", "disabled"].includes(String(rule.enforcement)) ||
        !["branch", "tag", "push"].includes(String(rule.target))
      )
        return branchFailure("unassessed_existing_ruleset");
      if (rule.enforcement === "active" && rule.target === "push")
        return branchFailure("unassessed_existing_ruleset", ["active_push_ruleset"]);
    }
    const effective = await this.pages((page) =>
      this.client.listManagedEffectiveBranchRulesPage(
        repo.owner,
        repo.name,
        branch,
        page,
        PAGE_SIZE,
        signal
      )
    );
    if (effective.length)
      return branchFailure("unassessed_existing_ruleset", ["active_applicable_ruleset"]);
  }

  private checkRest(
    response: GitHubOrganizationResponse,
    rule: ObservedBranchRule | undefined
  ): void {
    if (response.status === HTTP_NOT_FOUND) {
      // Only an absent GraphQL effective rule plus a protected-branch 404 establishes no classic rule.
      if (rule) return branchFailure("ambiguous_branch_protection");
      const headers = new Headers(response.headers);
      const body =
        response.data && typeof response.data === "object"
          ? (response.data as Record<string, unknown>)
          : {};
      const message = typeof body.message === "string" ? body.message : "";
      if (
        headers.has("x-github-sso") ||
        headers.has("retry-after") ||
        headers.get("x-ratelimit-remaining") === "0" ||
        /OAuth.*restric|third.party.*(restric|approv)|rate limit/i.test(message)
      )
        checked(response);
      return;
    }
    const value = object(checked(response));
    if (!rule) return branchFailure("ambiguous_branch_protection");
    const known = [
      "url",
      "required_status_checks",
      "required_pull_request_reviews",
      "restrictions",
      "enforce_admins",
      "required_signatures",
      "required_linear_history",
      "allow_force_pushes",
      "allow_deletions",
      "block_creations",
      "required_conversation_resolution",
      "lock_branch",
      "allow_fork_syncing"
    ];
    if (Object.keys(value).some((key) => !known.includes(key)))
      return branchFailure("unsupported_branch_protection", ["unsupported_rest_protection_fields"]);
    const enabled = (input: unknown): boolean => {
      const v = object(input);
      if (typeof v.enabled !== "boolean") return branchFailure("unexpected_response");
      return v.enabled;
    };
    if (
      enabled(value.enforce_admins) !== rule.isAdminEnforced ||
      (value.allow_force_pushes === null ? false : enabled(value.allow_force_pushes)) !==
        rule.allowsForcePushes ||
      (value.allow_deletions === null ? false : enabled(value.allow_deletions)) !==
        rule.allowsDeletions
    )
      return branchFailure("ambiguous_branch_protection");
    const conflicts = [
      ...(value.required_pull_request_reviews !== undefined &&
      value.required_pull_request_reviews !== null
        ? ["required_pull_request_reviews"]
        : []),
      ...(value.required_status_checks !== undefined && value.required_status_checks !== null
        ? ["required_status_checks"]
        : []),
      ...(value.restrictions !== undefined && value.restrictions !== null
        ? ["push_restrictions"]
        : []),
      ...[
        "required_signatures",
        "required_linear_history",
        "required_conversation_resolution",
        "lock_branch"
      ].filter((key) => value[key] !== undefined && enabled(value[key]))
    ];
    if (conflicts.length)
      return branchFailure("incompatible_existing_branch_protection", conflicts);
  }

  private async snapshot(
    target: BranchTarget,
    signal: AbortSignal,
    expectedBranch?: string
  ): Promise<BranchSnapshot> {
    const repo = await this.repository(target, signal);
    const branch = target.submissionBranch ?? repo.defaultBranch;
    if (!isManagedBranchName(branch)) return branchFailure("invalid_submission_branch");
    try {
      if (expectedBranch !== undefined && branch !== expectedBranch)
        return branchFailure(
          target.submissionBranch === undefined
            ? "default_branch_changed"
            : "branch_identity_changed"
        );
      const rules = new Map<string, ObservedBranchRule>();
      const cursors = new Set<string>();
      let cursor: string | null = null;
      let refId: string | undefined;
      let effectiveId: string | null | undefined;
      let complete = false;
      for (let page = 1; page <= PAGE_LIMIT; page += 1) {
        const payload = object(
          checked(await this.client.getManagedBranchRulesPage(repo.nodeId, branch, cursor, signal))
        );
        if (payload.errors !== undefined) return branchFailure("unexpected_response");
        const node = object(object(payload.data).node);
        if (node.databaseId !== repo.id || object(node.owner).databaseId !== repo.organizationId)
          return branchFailure("repository_identity_mismatch");
        if (target.submissionBranch === undefined) {
          const defaultRef = object(node.defaultBranchRef);
          if (defaultRef.name !== branch || defaultRef.prefix !== "refs/heads/")
            return branchFailure("default_branch_changed");
        }
        if (node.ref === null) return branchFailure("branch_missing");
        const ref = object(node.ref);
        if (ref.name !== branch || ref.prefix !== "refs/heads/")
          return branchFailure("branch_identity_changed");
        const id = text(ref.id);
        const effective =
          ref.branchProtectionRule === null ? null : text(object(ref.branchProtectionRule).id);
        if (refId !== undefined && (refId !== id || effectiveId !== effective))
          return branchFailure("branch_protection_changed");
        refId = id;
        effectiveId = effective;
        const connection = object(node.branchProtectionRules);
        if (!Array.isArray(connection.nodes) || connection.nodes.length > PAGE_SIZE)
          return branchFailure("unexpected_response");
        for (const input of connection.nodes as unknown[]) {
          const parsed = branchRuleSchema.safeParse(input);
          if (!parsed.success || parsed.data.repository.databaseId !== repo.id)
            return branchFailure("unexpected_response");
          const previous = rules.get(parsed.data.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(parsed.data))
            return branchFailure("ambiguous_branch_protection");
          rules.set(parsed.data.id, Object.freeze(parsed.data));
        }
        const info = object(connection.pageInfo);
        if (typeof info.hasNextPage !== "boolean") return branchFailure("unexpected_response");
        if (!info.hasNextPage) {
          complete = true;
          break;
        }
        const next = text(info.endCursor);
        if (cursors.has(next)) return branchFailure("incomplete_branch_inventory");
        cursors.add(next);
        cursor = next;
      }
      if (!complete || !refId || effectiveId === undefined)
        return branchFailure("incomplete_branch_inventory");
      const decision = decideManagedBranchPolicy(branch, [...rules.values()], effectiveId);
      await this.checkRulesets(repo, branch, signal);
      this.checkRest(
        await this.client.getManagedBranchProtection(repo.owner, repo.name, branch, signal),
        decision.rule
      );
      const after = await this.repository(target, signal);
      if (
        repo.id !== after.id ||
        repo.nodeId !== after.nodeId ||
        repo.owner !== after.owner ||
        repo.name !== after.name
      )
        return branchFailure("repository_changed_during_read");
      if (target.submissionBranch === undefined && after.defaultBranch !== branch)
        return branchFailure("default_branch_changed");
      return {
        repo: after,
        branch,
        refId,
        rules: Object.freeze([...rules.values()]),
        effectiveId,
        decision
      };
    } catch (error) {
      throw new ManagedBranchError(
        why(error),
        error instanceof ManagedBranchError ? error.conditions : [],
        branch
      );
    }
  }

  private async journal<T>(operation: () => T | Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      return branchFailure("branch_journal_unavailable");
    }
  }
  private async reconcileTarget(
    target: BranchTarget,
    signal: AbortSignal
  ): Promise<ManagedBranchOutcome> {
    let snapshot: BranchSnapshot | undefined;
    let attempted = false;
    try {
      snapshot = await this.snapshot(target, signal);
      const key = `managed-branch-create:${String(this.context.organizationId)}:${String(target.repositoryId)}:${snapshot.branch}`;
      if (snapshot.decision.action === "none") {
        await this.journal(() => this.creationJournal.delete(key));
        return Object.freeze({
          ...this.base(target),
          branchName: snapshot.branch,
          observedProtection: snapshot.decision.observed,
          ...(snapshot.decision.rule ? { ruleId: snapshot.decision.rule.id } : {}),
          status: "up_to_date"
        });
      }
      const fresh = await this.snapshot(target, signal, snapshot.branch);
      if (fresh.refId !== snapshot.refId) return branchFailure("branch_identity_changed");
      if (fresh.decision.action === "none")
        return Object.freeze({
          ...this.base(target),
          branchName: fresh.branch,
          observedProtection: fresh.decision.observed,
          ...(fresh.decision.rule ? { ruleId: fresh.decision.rule.id } : {}),
          status: "up_to_date"
        });
      if (
        fresh.decision.action !== snapshot.decision.action ||
        fresh.effectiveId !== snapshot.effectiveId ||
        fresh.decision.rule?.id !== snapshot.decision.rule?.id
      )
        return branchFailure("branch_protection_changed");
      snapshot = fresh;
      if (fresh.decision.action === "create") {
        if (await this.journal(() => this.creationJournal.has(key)))
          return branchFailure("branch_creation_unresolved");
        await this.journal(() => this.creationJournal.add(key));
      }
      // Journal storage may be asynchronous: refresh branch, effective rule and authority after it.
      const lastSnapshot = await this.snapshot(target, signal, fresh.branch);
      if (lastSnapshot.refId !== fresh.refId) return branchFailure("branch_identity_changed");
      if (lastSnapshot.decision.action === "none") {
        if (fresh.decision.action === "create")
          await this.journal(() => this.creationJournal.delete(key));
        return Object.freeze({
          ...this.base(target),
          branchName: lastSnapshot.branch,
          observedProtection: lastSnapshot.decision.observed,
          ...(lastSnapshot.decision.rule ? { ruleId: lastSnapshot.decision.rule.id } : {}),
          status: "up_to_date"
        });
      }
      if (
        lastSnapshot.decision.action !== fresh.decision.action ||
        lastSnapshot.effectiveId !== fresh.effectiveId
      )
        return branchFailure("branch_protection_changed");
      const last = lastSnapshot.repo;
      if (
        last.nodeId !== fresh.repo.nodeId ||
        last.owner !== fresh.repo.owner ||
        last.name !== fresh.repo.name
      )
        return branchFailure("repository_changed_during_read");
      if (target.submissionBranch === undefined && last.defaultBranch !== fresh.branch)
        return branchFailure("default_branch_changed");
      attempted = true;
      let mutationError: unknown;
      let createdId: string | undefined;
      try {
        const response =
          fresh.decision.action === "create"
            ? await this.client.createManagedBranchRule(last.nodeId, fresh.branch, signal)
            : await this.client.tightenManagedBranchRule(text(fresh.decision.rule?.id), signal);
        const payload = object(checked(response));
        if (payload.errors !== undefined) return branchFailure("unexpected_response");
        const data = object(payload.data);
        const mutation = object(
          data[
            fresh.decision.action === "create"
              ? "createBranchProtectionRule"
              : "updateBranchProtectionRule"
          ]
        );
        const resultId = text(object(mutation.branchProtectionRule).id);
        if (fresh.decision.action === "create") createdId = resultId;
        else if (resultId !== fresh.decision.rule?.id)
          return branchFailure("ambiguous_branch_protection");
      } catch (error) {
        mutationError = error;
      }
      const recoverySignal = signal.aborted ? AbortSignal.timeout(TIMEOUT_MS) : signal;
      const after = await this.snapshot(target, recoverySignal, fresh.branch);
      snapshot = after;
      if (
        after.decision.action !== "none" ||
        after.refId !== fresh.refId ||
        (fresh.decision.action === "create" &&
          (after.decision.rule?.pattern !== fresh.branch ||
            (createdId !== undefined && after.decision.rule.id !== createdId))) ||
        (fresh.decision.action === "update" && after.decision.rule?.id !== fresh.decision.rule?.id)
      )
        return branchFailure(
          mutationError === undefined ? "branch_protection_unverified" : why(mutationError)
        );
      if (fresh.decision.action === "create")
        await this.journal(() => this.creationJournal.delete(key));
      return Object.freeze({
        ...this.base(target),
        branchName: after.branch,
        observedProtection: after.decision.observed,
        ...(after.decision.rule ? { ruleId: after.decision.rule.id } : {}),
        status: "reconciled"
      });
    } catch (error) {
      return this.failure(target, error, snapshot, attempted);
    }
  }
}
