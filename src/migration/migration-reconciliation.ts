import { randomUUID } from "node:crypto";
import type {
  GitHubFacultyOrganizationClient,
  GitHubManagedTeamClient,
  GitHubCoursePermissionClient,
  GitHubManagedBranchClient
} from "../github/github-client.js";
import {
  FacultyOrganizationReconciler,
  type FacultyInvitationJournal
} from "../github/faculty-organization-access.js";
import { ManagedTeamMembershipReconciler } from "../github/managed-team-reconciliation.js";
import { CourseRepositoryPermissionReconciler } from "../github/course-repository-permissions.js";
import {
  StudentRepositoryPermissionReconciler,
  type StudentRepositoryPermissionClient
} from "../github/student-repository-permissions.js";
import { ManagedBranchReconciler } from "../github/managed-branch-reconciliation.js";
import {
  LegacyGraderReconciler,
  type PublishedGraderContext
} from "./legacy-grader-reconciliation.js";
import {
  canRecoverMigration,
  createReconciliationRecord,
  validateReconciliationRecord,
  reconciliationValue,
  ReconciliationNeedsAttention,
  type ReconciliationRecord,
  type ReconciliationSnapshot
} from "./migration-reconciliation-state.js";
import { stableJson, compare } from "./migration-evidence.js";

export type ReconciliationClient = GitHubFacultyOrganizationClient &
  GitHubManagedTeamClient &
  GitHubCoursePermissionClient &
  StudentRepositoryPermissionClient &
  GitHubManagedBranchClient;
export interface ReconciliationStore {
  /** Fresh authoritative remote observation, including original publication and every descendant. */
  observe(): Promise<ReconciliationSnapshot>;
  assertCurrent(snapshot: ReconciliationSnapshot): Promise<void>;
  /** Exact-base, one winner, remote-confirmed publication. Never retries a losing write. */
  publish(expectedRevision: string, record: ReconciliationRecord): Promise<ReconciliationSnapshot>;
}
export interface MigrationReconciliationResult {
  readonly published: true | null;
  readonly status: "ready" | "needs_attention";
  readonly studentFacingReady: boolean;
  readonly publication?: string;
  readonly journalRevision?: string;
  readonly attention: readonly string[];
}
const writes = new Set<keyof ReconciliationClient>([
  "createOrganizationInvitation",
  "createManagedTeam",
  "setManagedTeamMembership",
  "setCourseRepositoryTeamPermission",
  "setCourseFallbackPermission",
  "createManagedBranchRule",
  "tightenManagedBranchRule"
]);
const safeReason = (value: unknown): string =>
  typeof value === "string" && /^[a-z][a-z0-9_:-]*$/u.test(value)
    ? value
    : "unverified_remote_outcome";
const complete = (value: { readonly status: string }) =>
  ["up_to_date", "reconciled", "removed", "already_absent"].includes(value.status);
const LAST_ENTRY_OFFSET = -1;

/** Main-only orchestration over existing desired-state engines. No publication rollback or provisioning. */
const runPublishedMigration = async (
  input: {
    readonly store: ReconciliationStore;
    readonly client: ReconciliationClient;
    readonly authenticatedUserId: number;
  },
  signal: AbortSignal | undefined,
  readOnly: boolean
): Promise<MigrationReconciliationResult> => {
  let current: ReconciliationSnapshot | undefined;
  let record: ReconciliationRecord;
  const state = () => reconciliationValue(current);
  const actor = input.authenticatedUserId;
  const attention = new Set<string>();
  let phase = "organization_access";
  const check = async () => {
    signal?.throwIfAborted();
    if (!current || !canRecoverMigration(current.course, current.terms, actor))
      throw new ReconciliationNeedsAttention("authorization_required");
    await input.store.assertCurrent(current);
  };
  const persist = async (next: ReconciliationRecord) => {
    await check();
    if (readOnly) {
      record = next;
    } else if (stableJson(next) !== stableJson(record)) {
      next.writeId = randomUUID();
      const observed = await input.store.publish(state().revision, next);
      if (
        observed.record?.writeId !== next.writeId ||
        observed.publication !== state().publication ||
        observed.intendedFingerprint !== state().intendedFingerprint
      )
        throw new Error("Journal publication was not independently verified.");
      current = observed;
      record = structuredClone(observed.record);
      validateReconciliationRecord(current);
      await check();
    }
  };
  interface Outcome {
    readonly status: string;
    readonly reason?: string;
    readonly repositoryId?: number | null;
    readonly teamId?: number;
    readonly githubUserId?: number;
  }
  const step = async (
    name: string,
    status: "verified" | "needs_attention" | "outcome_unknown",
    reasons: readonly string[],
    outcomes?: readonly Outcome[]
  ) => {
    const prior = record.steps.find((entry) => entry.step === name);
    const resources =
      outcomes
        ?.map((outcome) => ({
          ...(outcome.repositoryId === undefined || outcome.repositoryId === null
            ? {}
            : { repositoryId: outcome.repositoryId }),
          ...(outcome.teamId === undefined ? {} : { teamId: outcome.teamId }),
          ...(outcome.githubUserId === undefined ? {} : { githubUserId: outcome.githubUserId }),
          status: complete(outcome) ? ("verified" as const) : ("needs_attention" as const),
          ...(outcome.reason === undefined ? {} : { reason: safeReason(outcome.reason) })
        }))
        .sort((left, right) => compare(stableJson(left), stableJson(right))) ??
      prior?.resources ??
      [];
    const value = {
      step: name,
      status,
      reasons: [...new Set(reasons.map(safeReason))].sort(),
      resources
    };
    if (stableJson(prior ?? null) !== stableJson(value)) {
      const next = structuredClone(record);
      next.steps = [...next.steps.filter((entry) => entry.step !== name), value];
      next.status = "needs_attention";
      next.history.push({ actor, observedRevision: state().revision, ...value });
      await persist(next);
    }
    if (status !== "verified") value.reasons.forEach((reason) => attention.add(reason));
  };
  const journal = (kind: "invitation" | "team" | "branch"): FacultyInvitationJournal => {
    // Invitation keys in Phase 7 contain the executing account and mutable organization locator.
    // Shared protection instead binds the invitee to this immutable course/organization record.
    const keyFor = (key: string): string =>
      kind === "invitation" ? `invitee:${key.split(":").at(LAST_ENTRY_OFFSET) ?? "invalid"}` : key;
    return {
      has: async (key) => {
        await check();
        return record.guards.some((g) => g.kind === kind && g.key === keyFor(key));
      },
      add: async (key) => {
        await check();
        if (readOnly) throw new Error("Read-only verification cannot create a resource.");
        const selected = keyFor(key);
        if (record.guards.some((g) => g.kind === kind && g.key === selected))
          throw new Error("Unresolved creation guard.");
        const next = structuredClone(record);
        next.guards.push({ kind, key: selected, actor });
        next.status = "needs_attention";
        next.history.push({
          actor,
          observedRevision: state().revision,
          step: phase,
          status: "guarded",
          reasons: []
        });
        await persist(next);
      },
      delete: async (key) => {
        await check();
        if (record.guards.some((g) => g.kind === kind && g.key === keyFor(key))) {
          const next = structuredClone(record);
          next.guards = next.guards.filter((g) => !(g.kind === kind && g.key === keyFor(key)));
          next.history.push({
            actor,
            observedRevision: state().revision,
            step: phase,
            status: "resolved",
            reasons: []
          });
          await persist(next);
        }
      }
    };
  };
  try {
    current = await input.store.observe();
    validateReconciliationRecord(current);
    await check();
    const recovery = current.metadata.recovery;
    if (!recovery) throw new ReconciliationNeedsAttention("fresh_plan_required");
    record = current.record ? structuredClone(current.record) : createReconciliationRecord(current);
    if (readOnly && record.status !== "ready")
      throw new Error("Complete reconciliation explicitly before checking access.");
    if (!current.record) {
      const initial = { ...record, writeId: randomUUID() };
      const observed = await input.store.publish(current.revision, initial);
      if (observed.record?.writeId !== initial.writeId)
        throw new Error("Initial journal outcome is unknown.");
      current = observed;
      record = structuredClone(observed.record);
      await check();
    }
    const guarded = new Proxy(input.client, {
      get(target, key) {
        const method = target[key as keyof ReconciliationClient];
        return typeof method !== "function"
          ? method
          : async (...args: unknown[]) => {
              await check();
              if (writes.has(key as keyof ReconciliationClient)) {
                if (readOnly) throw new Error("Read-only verification cannot change GitHub state.");
                await step(phase, "outcome_unknown", ["remote_operation_pending"]);
              }
              await check();
              const response: unknown = await Reflect.apply(method, target, args);
              await check();
              return response;
            };
      }
    });
    const context = {
      course: current.course,
      terms: current.terms,
      courseRepositoryId: reconciliationValue(current.course.course.repository_id),
      organizationId: reconciliationValue(current.course.course.organization_binding)
        .organization_id,
      authenticatedUserId: actor
    };
    const draftTargets = current.targets.some((target) =>
      state().terms.some(
        (term) => term.term.code === target.termCode && term.term.status === "draft"
      )
    );
    const studentTargets = draftTargets ? [] : current.targets;
    const invitations = journal("invitation"),
      teams = journal("team");
    const access = new FacultyOrganizationReconciler(guarded, context, invitations);
    const org = [];
    for (const faculty of current.course.faculty_directory)
      org.push(await access.reconcile(faculty.github_user_id, signal));
    await step(
      phase,
      org.every((item) => item.state === "active") ? "verified" : "needs_attention",
      org.flatMap((item) =>
        item.state === "active" ? [] : [item.state === "needs_attention" ? item.reason : item.state]
      ),
      org.map((item) => ({
        githubUserId: item.githubUserId,
        status: item.state === "active" ? "up_to_date" : item.state,
        ...(item.state === "needs_attention" ? { reason: item.reason } : {})
      }))
    );
    const membership = new ManagedTeamMembershipReconciler(
      guarded,
      context,
      access,
      teams,
      "term-lifecycle"
    );
    const run = async (name: string, operation: () => Promise<readonly Outcome[]>) => {
      phase = name;
      await check();
      try {
        const results = await operation();
        await check();
        await step(
          name,
          results.every(complete) ? "verified" : "needs_attention",
          results.filter((r) => !complete(r)).map((r) => r.reason ?? r.status),
          results
        );
      } catch {
        await step(name, "needs_attention", ["unverified_remote_outcome"]);
      }
    };
    await run("teams", () => membership.reconcile(signal));
    const readers = (organization: string) => {
      const selected = {
        ...context,
        course: { ...context.course, github: { ...context.course.github, organization } }
      };
      const organizationAccess = new FacultyOrganizationReconciler(guarded, selected, invitations);
      return {
        organizationAccess,
        membership: new ManagedTeamMembershipReconciler(
          guarded,
          selected,
          organizationAccess,
          teams,
          "term-lifecycle"
        )
      };
    };
    const inspect = (organization: string, s: AbortSignal) =>
      readers(organization).membership.inspect(s);
    await run("course_access", () =>
      new CourseRepositoryPermissionReconciler(guarded, context, {
        inspectTeamMemberships: inspect,
        inspectOrganizationAccess: (organization, s) =>
          readers(organization).organizationAccess.inspect(s)
      }).reconcile(signal)
    );
    await run("student_access", () =>
      new StudentRepositoryPermissionReconciler(
        guarded,
        { ...context, targets: studentTargets },
        inspect
      ).reconcile(signal)
    );
    await run("branches", () =>
      new ManagedBranchReconciler(
        guarded,
        { ...context, studentTargets },
        journal("branch")
      ).reconcile(signal)
    );
    const legacy = recovery.legacy;
    await run("legacy_cleanup", async () => {
      const operationalFindings = legacy.audit.inventory.findings.filter(
        (finding) =>
          !["runtime_coverage_unknown", "runtime_repository_unproven", "team_missing"].includes(
            finding.code
          )
      );
      if (operationalFindings.length)
        return [{ status: "needs_attention", reason: "legacy_inventory_unverified" }];
      if (!legacy.reconciliation.grants.length) return [];
      const published: PublishedGraderContext = {
        ...context,
        sessionId: `recovery:${state().publication}`,
        authorized: true,
        publishedRevision: state().publication,
        targets: studentTargets
      };
      const result = await new LegacyGraderReconciler(guarded, published, legacy, {
        readPublished: async () => {
          await check();
          return published;
        },
        organizationAccess: access,
        creationJournal: teams,
        recovery: { reviewedGithubUserId: state().metadata.source.authenticated_github_user_id }
      }).reconcile(signal);
      return result.targets;
    });
    const targetAttention = [
      ...current.targetAttention,
      ...(draftTargets ? ["draft_student_target_prohibited"] : [])
    ];
    await step("targets", targetAttention.length ? "needs_attention" : "verified", targetAttention);
    await check();
    const ready = record.guards.length === 0 && record.steps.every((s) => s.status === "verified");
    if (record.status !== (ready ? "ready" : "needs_attention"))
      await persist({ ...record, status: ready ? "ready" : "needs_attention" });
    await check();
    return {
      published: true,
      status: ready ? "ready" : "needs_attention",
      studentFacingReady:
        ready &&
        current.course.course.lifecycle === "unarchived" &&
        current.terms.some((t) => t.term.status === "active"),
      publication: current.publication,
      journalRevision: current.revision,
      attention: [...attention]
    };
  } catch (error) {
    return {
      published: current ? true : null,
      status: "needs_attention",
      studentFacingReady: false,
      ...(current ? { publication: current.publication, journalRevision: current.revision } : {}),
      attention: [
        ...attention,
        error instanceof ReconciliationNeedsAttention
          ? error.reason
          : "reconciliation_context_unverified"
      ]
    };
  }
};

export const reconcilePublishedMigration = (
  input: Parameters<typeof runPublishedMigration>[0],
  signal?: AbortSignal
) => runPublishedMigration(input, signal, false);
/** Fresh observed access, with all Git/GitHub mutations disabled. A stored Ready flag is never sufficient. */
export const verifyPublishedMigrationAccess = (
  input: Parameters<typeof runPublishedMigration>[0],
  signal?: AbortSignal
) => runPublishedMigration(input, signal, true);
