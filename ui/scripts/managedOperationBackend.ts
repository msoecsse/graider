import fs from "node:fs";
import path from "node:path";
import { readActivationMetadata } from "../../src/terms/term-activation-metadata.js";
import { loadCourseConfig } from "../../src/config/load-course-config.js";
import { migrationCourseSchema } from "../../src/migration/migration-candidate-schemas.js";
import { resolveManagedReadScope } from "../../src/faculty/managed-operation-authorization.js";
import type { AuthorizationScope } from "../../src/faculty/authorization-resolver.js";
import { loadTermRosters } from "../../src/roster/roster-loader.js";
import { createRosterSummary } from "../../src/roster/roster-models.js";
import { loadCommentLibrary } from "../../src/grading/comment-library.js";
import { CourseLifecycleAuthorizationResolver } from "../../src/faculty/course-lifecycle-authorization-resolver.js";
import { readRecoveryCheckpoints } from "../../src/terms/activation-recovery-storage.js";
import { TermActivationAuthorizationResolver } from "../../src/faculty/term-activation-authorization-resolver.js";
import {
  DraftDeletionAuthorizationResolver,
  TermActivationRecoveryAuthorizationResolver
} from "../../src/faculty/term-recovery-authorization.js";
import { readMigrationReconciliationSnapshot } from "../../src/migration/migration-reconciliation-git.js";
import { createMigrationGitRunners } from "../../src/migration/migration-git.js";
import { GitCommandWorkspaceFactory } from "../../src/git/git-command-workspace.js";

export { MANAGED_OPERATION_SUPPORT } from "../../src/faculty/managed-operation-authorization.js";
export {
  buildNewCourseMetadata,
  newRemoteCourseRequestSchema,
  validateSetupDirectory
} from "../../src/courses/new-course-setup.js";
export { reconcileCourseTermLifecycle } from "../../src/terms/activation-reconciliation.js";
export { ManagedBranchReconciler } from "../../src/github/managed-branch-reconciliation.js";

export const readManagedOperationState = (
  root: string,
  identity: {
    readonly organization: string;
    readonly organizationId: number;
    readonly repositoryId: number;
    readonly userId: number;
  }
) => {
  const parsed = loadCourseConfig(path.join(root, "course.yml"));
  if (parsed.status !== "success") throw new Error("Invalid course metadata.");
  const course = migrationCourseSchema.parse(parsed.value);
  if (
    course.course.repository_id !== identity.repositoryId ||
    course.course.organization_binding.organization_id !== identity.organizationId ||
    !course.faculty_directory.some((faculty) => faculty.github_user_id === identity.userId)
  )
    throw new Error("Course identity or account authorization changed.");
  if (
    course.course.organization_binding.organization_login.toLowerCase() !==
    course.github.organization.toLowerCase()
  )
    throw new Error("Contradictory organization locators.");
  // Same-ID renames may leave persisted locators stale. They are never identity evidence.
  const state = readActivationMetadata(root, course.github.organization);
  return { ...state, course };
};

/** No migration-audit assertion is accepted as proof of completed reconciliation. */
export const hasUnresolvedManagedReadiness = async (root: string): Promise<boolean> => {
  if (fs.existsSync(path.join(root, ".graider/reconciliation.yml"))) return true;
  if (
    ![".graider/migration.json", ".graider/reconciliation.json"].some((file) =>
      fs.existsSync(path.join(root, file))
    )
  )
    return false;
  try {
    const workspace = await new GitCommandWorkspaceFactory(createMigrationGitRunners()).open(root);
    const state = await readMigrationReconciliationSnapshot(root, await workspace.resolveHead());
    return state.record?.status !== "ready";
  } catch {
    return true;
  }
};

export const readManagedOperationCapabilities = async (
  root: string,
  identity: Parameters<typeof readManagedOperationState>[1]
) => {
  const { course, terms } = readManagedOperationState(root, identity);
  const policy = new CourseLifecycleAuthorizationResolver(course, terms, identity.userId, {
    complete: true,
    checkpoints: readRecoveryCheckpoints(root, terms, identity.repositoryId)
  });
  const unresolved = await hasUnresolvedManagedReadiness(root);
  return {
    archiveAllowed: !unresolved && policy.canArchiveCourse().allowed,
    unarchiveAllowed: !unresolved && policy.canUnarchiveCourse().allowed,
    lifecycleReason: unresolved
      ? "reconciliation-required"
      : course.course.lifecycle === "archived"
        ? policy.canUnarchiveCourse().basis
        : policy.canArchiveCourse().basis
  };
};

export const authorizeManagedTermLifecycle = (
  root: string,
  identity: Parameters<typeof readManagedOperationState>[1],
  target: string,
  operation:
    | "activate"
    | "delete-draft"
    | "safe-rollback"
    | "accept-current"
    | "restore-predecessor"
) => {
  const { course, terms } = readManagedOperationState(root, identity);
  return operation === "activate"
    ? new TermActivationAuthorizationResolver(
        course,
        terms,
        target,
        identity.userId
      ).canActivateTerm()
    : operation === "delete-draft"
      ? new DraftDeletionAuthorizationResolver(
          course,
          terms,
          target,
          identity.userId
        ).canDeleteDraft()
      : new TermActivationRecoveryAuthorizationResolver(
          course,
          terms,
          target,
          identity.userId
        ).canRecoverActivation();
};

export const readManagedRoster = (
  root: string,
  identity: Parameters<typeof readManagedOperationState>[1],
  termCode: string,
  sectionId: string | undefined,
  scope: AuthorizationScope
) => {
  const { course, terms } = readManagedOperationState(root, identity);
  const access = resolveManagedReadScope(course, terms, identity.userId, termCode, scope);
  if (
    !access.termVisible ||
    (sectionId !== undefined && !access.visibleSectionIds.includes(sectionId))
  )
    throw new Error("Section access is not authorized.");
  const term = terms.find((item) => item.term.code === termCode)!;
  const sections = term.sections.filter(
    (section) =>
      access.visibleSectionIds.includes(section.id) &&
      (sectionId === undefined || section.id === sectionId)
  );
  // Validate before loading any student bytes; only authorized section files enter the loader.
  for (const section of sections) {
    if (
      section.roster &&
      (!/^rosters\/[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/u.test(section.roster) ||
        section.roster.includes(".."))
    )
      throw new Error("Unsafe roster path.");
  }
  const roster = loadTermRosters({
    repoRoot: root,
    termConfigPath: `terms/${termCode}/term.yml`,
    sections,
    sectionIds: sections.map((section) => section.id)
  });
  return {
    sections,
    roster,
    summary: createRosterSummary(roster.summary.rosterFiles, roster.students)
  };
};

export const readManagedRosterTerms = (
  root: string,
  identity: Parameters<typeof readManagedOperationState>[1],
  scope: AuthorizationScope
) => {
  const { course, terms } = readManagedOperationState(root, identity);
  return terms.flatMap((term) => {
    const access = resolveManagedReadScope(course, terms, identity.userId, term.term.code, scope);
    return access.termVisible
      ? [{ code: term.term.code, sections: [...access.visibleSectionIds] }]
      : [];
  });
};

export const readManagedComments = (
  root: string,
  identity: Parameters<typeof readManagedOperationState>[1],
  termCode: string
) => {
  const { course, terms } = readManagedOperationState(root, identity);
  if (!resolveManagedReadScope(course, terms, identity.userId, termCode).commentsVisible)
    throw new Error("Comment library access is not authorized.");
  return loadCommentLibrary(root);
};
