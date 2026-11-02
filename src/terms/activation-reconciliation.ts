import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import type {
  GitHubFacultyOrganizationClient,
  GitHubManagedTeamClient,
  GitHubCoursePermissionClient
} from "../github/github-client.js";
import {
  FacultyOrganizationReconciler,
  type FacultyInvitationJournal,
  type FacultyOrganizationAccess
} from "../github/faculty-organization-access.js";
import {
  ManagedTeamMembershipReconciler,
  type ManagedTeamOutcome
} from "../github/managed-team-reconciliation.js";
import {
  CourseRepositoryPermissionReconciler,
  type CourseRepositoryPermissionOutcome
} from "../github/course-repository-permissions.js";
import {
  StudentRepositoryPermissionReconciler,
  type StudentRepositoryPermissionClient,
  type StudentRepositoryPermissionOutcome
} from "../github/student-repository-permissions.js";
import { validateStudentRepositoryTargets } from "../github/student-repository-target.js";
import { buildLifecycleTeamMemberships } from "../github/lifecycle-team-membership.js";
import { CourseTermLifecycle } from "./course-term-lifecycle.js";

export interface ActivationReconciliationInput {
  readonly course: RawCourseConfigV2;
  readonly terms: readonly RawTermConfigV2[];
  readonly activeTermCode: string;
  readonly courseRepositoryId: number;
  readonly organizationId: number;
  readonly authenticatedUserId: number;
  readonly studentTargets: readonly unknown[];
  readonly client: GitHubFacultyOrganizationClient &
    GitHubManagedTeamClient &
    GitHubCoursePermissionClient &
    StudentRepositoryPermissionClient;
  readonly invitationJournal: FacultyInvitationJournal;
  readonly teamCreationJournal: FacultyInvitationJournal;
}
export interface ActivationReconciliation {
  readonly status: "reconciled" | "needs_reconciliation";
  readonly studentFacingReady: boolean;
  readonly organization: readonly FacultyOrganizationAccess[];
  readonly teams: readonly ManagedTeamOutcome[];
  readonly coursePermissions: readonly CourseRepositoryPermissionOutcome[];
  readonly studentPermissions: readonly StudentRepositoryPermissionOutcome[];
}

/**
 * Explicit reconciliation from already published, authoritative metadata. Caller holds the
 * same course/session/revision lease and supplies durable journals and trusted repository evidence.
 * This does not activate, provision, change branch rules, retry ambiguous writes or roll back Git.
 */
export const reconcileTermActivation = async (
  input: ActivationReconciliationInput,
  signal?: AbortSignal
): Promise<ActivationReconciliation> => {
  const course = rawCourseConfigV2Schema.parse(input.course);
  const terms = input.terms.map((term) => rawTermConfigV2Schema.parse(term));
  const lifecycle = new CourseTermLifecycle(terms);
  if (lifecycle.requireActiveTerm().term.code !== input.activeTermCode)
    throw new Error("Activation reconciliation requires the authoritative Active term.");
  const targets = structuredClone(input.studentTargets);
  for (const value of validateStudentRepositoryTargets(targets)) {
    if (value.status === "ready" && lifecycle.getStatus(value.target.termCode) === "draft") {
      throw new Error("Draft terms cannot have student repository grants.");
    }
  }
  const context = {
    course,
    terms,
    courseRepositoryId: input.courseRepositoryId,
    organizationId: input.organizationId,
    authenticatedUserId: input.authenticatedUserId
  };
  const desired = buildLifecycleTeamMemberships(course, terms, input.courseRepositoryId);
  const relevantIds = new Set(desired.flatMap((team) => team.githubUserIds));
  relevantIds.add(course.fallback_administrator.github_user_id);
  const access = new FacultyOrganizationReconciler(input.client, context, input.invitationJournal);
  const organization: FacultyOrganizationAccess[] = [];
  for (const id of relevantIds) organization.push(await access.reconcile(id, signal));
  const membership = new ManagedTeamMembershipReconciler(
    input.client,
    context,
    access,
    input.teamCreationJournal,
    "term-lifecycle"
  );
  const teams = await membership.reconcile(signal);
  // Readers rerender the same projection against fresh observed state; never invoke membership writes again here.
  const readers = (organization: string) => {
    // Permission engines supply locators only after verifying immutable organization identity.
    const selected = {
      ...context,
      course: { ...course, github: { ...course.github, organization } }
    };
    const organizationAccess = new FacultyOrganizationReconciler(
      input.client,
      selected,
      input.invitationJournal
    );
    return {
      organizationAccess,
      membership: new ManagedTeamMembershipReconciler(
        input.client,
        selected,
        organizationAccess,
        input.teamCreationJournal,
        "term-lifecycle"
      )
    };
  };
  const inspect = (organization: string, currentSignal: AbortSignal) =>
    readers(organization).membership.inspect(currentSignal);
  const coursePermissions = await new CourseRepositoryPermissionReconciler(input.client, context, {
    inspectTeamMemberships: inspect,
    inspectOrganizationAccess: (organization, currentSignal) =>
      readers(organization).organizationAccess.inspect(currentSignal)
  }).reconcile(signal);
  const studentPermissions = await new StudentRepositoryPermissionReconciler(
    input.client,
    { ...context, targets },
    inspect
  ).reconcile(signal);
  const complete =
    organization.every((value) => value.state === "active") &&
    [...teams, ...coursePermissions, ...studentPermissions].every(
      (value) => value.status === "up_to_date" || value.status === "reconciled"
    );
  return Object.freeze({
    status: complete ? "reconciled" : "needs_reconciliation",
    studentFacingReady: complete,
    organization: Object.freeze(organization),
    teams,
    coursePermissions,
    studentPermissions
  });
};
