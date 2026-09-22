/**
 * Every route path this app defines (README section 4.1), built from slugs
 * rather than written out at each call site. The five paths beyond the
 * dashboard, roster and assignment-detail routes are extensions beyond
 * section 4.1's original table -- see the PR10-1 summary.
 */
export const DASHBOARD_PATH = "/";

export const getRosterPath = (courseSlug: string, termSlug: string): string =>
  `/course/${courseSlug}/${termSlug}/roster`;

export const getAssignmentDetailPath = (
  courseSlug: string,
  termSlug: string,
  assignmentSlug: string
): string => `/course/${courseSlug}/${termSlug}/${assignmentSlug}`;

const getAssignmentSubPath = (
  courseSlug: string,
  termSlug: string,
  assignmentSlug: string,
  subPath: string
): string => `${getAssignmentDetailPath(courseSlug, termSlug, assignmentSlug)}/${subPath}`;

export const getGradingWorkspacePath = (
  courseSlug: string,
  termSlug: string,
  assignmentSlug: string
): string => getAssignmentSubPath(courseSlug, termSlug, assignmentSlug, "grade");

export const getApplyPreviewPath = (
  courseSlug: string,
  termSlug: string,
  assignmentSlug: string
): string => getAssignmentSubPath(courseSlug, termSlug, assignmentSlug, "apply");

export const getGradePreviewPath = (
  courseSlug: string,
  termSlug: string,
  assignmentSlug: string
): string => getAssignmentSubPath(courseSlug, termSlug, assignmentSlug, "grade-preview");

export const getGradeStatusPath = (
  courseSlug: string,
  termSlug: string,
  assignmentSlug: string
): string => getAssignmentSubPath(courseSlug, termSlug, assignmentSlug, "status");

export const getFacultyReportPath = (
  courseSlug: string,
  termSlug: string,
  assignmentSlug: string
): string => getAssignmentSubPath(courseSlug, termSlug, assignmentSlug, "report");

export const getAssignmentEditPath = (
  courseSlug: string,
  termSlug: string,
  assignmentSlug: string
): string => getAssignmentSubPath(courseSlug, termSlug, assignmentSlug, "edit");

const FALLBACK_SLUG = "unknown";

/** `AssignmentDetailSelection`'s slug fields are nullable; route paths are not. */
export const toRouteSlug = (slug: string | null): string => slug ?? FALLBACK_SLUG;
