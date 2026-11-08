import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { CourseLifecycle } from "../courses/course-lifecycle.js";
import { AuthorizationResolver, type AuthorizationScope } from "./authorization-resolver.js";
import { DraftTermAuthorizationResolver } from "./draft-term-authorization-resolver.js";
import { ArchivedTermAuthorizationResolver } from "./archived-term-authorization-resolver.js";

/** Operation support is deliberately narrower than parser and role-policy support. */
export const MANAGED_OPERATION_SUPPORT = Object.freeze({
  metadata: "supported",
  "roster-read": "adapted",
  "comments-read": "adapted",
  "course-lifecycle": "adapted",
  "term-lifecycle": "trusted-evidence-required",
  "course-configuration": "unavailable",
  "roster-write": "phase-11-13",
  assignment: "phase-10",
  apply: "phase-11-13",
  repositories: "phase-12-13",
  workflows: "phase-10-11-13",
  templates: "phase-10-11-16",
  grading: "phase-14",
  reports: "phase-14",
  "comments-write": "ownership-history-required",
  "access-pages": "phase-11-13",
  publication: "operation-specific-authority-required"
} as const);
export type ManagedOperationFamily = keyof typeof MANAGED_OPERATION_SUPPORT;

/** Pure policy over a complete trusted snapshot. Never accepts usernames as authority. */
export const resolveManagedReadScope = (
  course: RawCourseConfigV2,
  terms: readonly RawTermConfigV2[],
  githubUserId: number,
  termCode: string,
  scope: AuthorizationScope = "default"
) => {
  new CourseLifecycle(course, terms);
  const target = terms.find((term) => term.term.code === termCode);
  if (!target) throw new Error("Unknown term.");
  const roles = new AuthorizationResolver(course, target, githubUserId);
  const draft =
    target.term.status === "draft"
      ? new DraftTermAuthorizationResolver(course, terms, termCode, githubUserId)
      : undefined;
  const archived =
    target.term.status === "archived"
      ? new ArchivedTermAuthorizationResolver(course, terms, termCode, githubUserId)
      : undefined;
  const sections = draft
    ? draft.getDraftSectionScope(scope).visibleSectionIds
    : archived
      ? archived.getArchivedSectionScope(scope).visibleSectionIds
      : roles.getSectionScope(scope).visibleSectionIds;
  const termVisible = draft
    ? draft.canViewDraftTerm().allowed
    : archived
      ? archived.canViewArchivedTerm().allowed
      : roles.canViewTerm().allowed || roles.hasFallbackAdministration().allowed;
  // A fallback-only identity can inspect administrative metadata, never the library.
  const commentsVisible =
    termVisible &&
    (sections.length > 0 ||
      roles.roleFacts.currentCoordinator ||
      (target.term.status !== "draft" && roles.roleFacts.formerCoordinator));
  return Object.freeze({
    termVisible,
    commentsVisible,
    visibleSectionIds: Object.freeze([...sections])
  });
};
