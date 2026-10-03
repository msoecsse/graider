import fs from "node:fs";
import path from "node:path";

import type { RawTermConfig } from "../config/config-models.js";
import { loadCourseConfig } from "../config/load-course-config.js";
import { loadTermConfig } from "../config/load-term-config.js";
import { createGitHubClient } from "../github/github-client-factory.js";
import type { GitHubClient } from "../github/github-client.js";
import type { GitHubPermission } from "../github/github-models.js";
import { loadTermRosters } from "../roster/roster-loader.js";
import {
  ROSTER_STATUS_ACTIVE,
  ROSTER_STATUS_DROPPED,
  ROSTER_STATUS_HOLD,
  type RosterStudent
} from "../roster/roster-models.js";

const PAGES_ACCESS_PERMISSION = "pull";
const TERM_CODE_PATTERN = /^\d{2}s[123]$/u;
const PERMISSION_RANK = {
  none: 0,
  pull: 1,
  triage: 2,
  push: 3,
  maintain: 4,
  admin: 5
} as const satisfies Record<GitHubPermission, number>;

export interface PagesAccessRemovedStudents {
  readonly termCode: string;
  readonly githubUsernames: readonly string[];
}

export interface PagesAccessRequest {
  readonly courseFolderPath: string;
  /** Students in a roster or section that was just removed; they lose access like dropped students. */
  readonly removedStudents?: PagesAccessRemovedStudents;
}

export interface PagesAccessFailure {
  readonly githubUsername: string;
  readonly action: "grant" | "remove";
}

export interface PagesAccessResult {
  readonly status: "success" | "partial_failure" | "failure" | "not_configured";
  readonly pagesRepository: string | null;
  readonly termCode: string | null;
  readonly granted: readonly string[];
  readonly removed: readonly string[];
  readonly failed: readonly PagesAccessFailure[];
  readonly diagnostics: readonly string[];
}

export interface PagesAccessDependencies {
  readonly createClient: (options: { readonly token: string }) => GitHubClient;
}

interface LoadedTerm {
  readonly code: string;
  readonly config: RawTermConfig;
}

interface AccessPlan {
  readonly keep: readonly string[];
  readonly remove: readonly string[];
  readonly diagnostics: readonly string[];
}

const defaultDependencies: PagesAccessDependencies = {
  createClient: ({ token }) => createGitHubClient({ token })
};

const emptyResult = (
  status: PagesAccessResult["status"],
  pagesRepository: string | null,
  diagnostics: readonly string[]
): PagesAccessResult => ({
  status,
  pagesRepository,
  termCode: null,
  granted: [],
  removed: [],
  failed: [],
  diagnostics
});

const listTermCodes = (courseFolderPath: string): readonly string[] => {
  try {
    return fs
      .readdirSync(path.join(courseFolderPath, "terms"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && TERM_CODE_PATTERN.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};

// Matches the assignments page (ui/electron/studentAccessPagesIndexService.ts): the most
// recent term is the one with the highest academic_year, then semester.
const findMostRecentTerm = (courseFolderPath: string): LoadedTerm | null =>
  listTermCodes(courseFolderPath)
    .flatMap((code): LoadedTerm[] => {
      const loaded = loadTermConfig(path.join(courseFolderPath, "terms", code, "term.yml"));
      return loaded.status === "success" ? [{ code, config: loaded.value }] : [];
    })
    .sort(
      (left, right) =>
        right.config.term.academic_year - left.config.term.academic_year ||
        right.config.term.semester - left.config.term.semester
    )[0] ?? null;

// Sections are loaded one at a time: a student who switched sections appears in two
// rosters, which a whole-term load reports as a duplicate.
const loadSectionStudents = (
  courseFolderPath: string,
  term: LoadedTerm
): { readonly students: readonly RosterStudent[]; readonly failedSections: readonly string[] } => {
  const loaded = term.config.sections
    .filter((section) => section.roster !== undefined)
    .map((section) => ({
      sectionId: section.id,
      result: loadTermRosters({
        repoRoot: courseFolderPath,
        termConfigPath: `terms/${term.code}/term.yml`,
        sections: term.config.sections,
        sectionIds: [section.id]
      })
    }));
  return {
    students: loaded.flatMap((entry) =>
      entry.result.errors.length === 0 ? entry.result.students : []
    ),
    failedSections: loaded
      .filter((entry) => entry.result.errors.length > 0)
      .map((entry) => entry.sectionId)
  };
};

const planAccess = (
  courseFolderPath: string,
  term: LoadedTerm,
  removedStudents: PagesAccessRemovedStudents | undefined
): AccessPlan => {
  const { students, failedSections } = loadSectionStudents(courseFolderPath, term);
  // A removed roster from an earlier term is ignored, like every earlier-term student.
  const removedUsernames =
    removedStudents?.termCode === term.code ? removedStudents.githubUsernames : [];
  const keep = new Set(
    students
      .filter(
        (student) =>
          student.status === ROSTER_STATUS_ACTIVE || student.status === ROSTER_STATUS_HOLD
      )
      .map((student) => student.githubUsername)
  );
  const dropped = new Set(
    [
      ...students
        .filter((student) => student.status === ROSTER_STATUS_DROPPED)
        .map((student) => student.githubUsername),
      ...removedUsernames
    ].filter((username) => !keep.has(username))
  );
  // Without every roster, a student dropped here may be active in an unreadable section,
  // so removals wait until all rosters load.
  return failedSections.length === 0
    ? { keep: [...keep].sort(), remove: [...dropped].sort(), diagnostics: [] }
    : {
        keep: [...keep].sort(),
        remove: [],
        diagnostics: [
          `Roster for section ${failedSections.join(", ")} could not be read, so no Pages access was removed.`
        ]
      };
};

const grantAccess = async (
  client: GitHubClient,
  owner: string,
  repo: string,
  username: string
): Promise<"granted" | "unchanged"> => {
  const current = await client.getCollaboratorPermission(owner, repo, username);
  if (PERMISSION_RANK[current.permission] >= PERMISSION_RANK[PAGES_ACCESS_PERMISSION])
    return "unchanged";
  await client.addCollaborator({ owner, repo, username, permission: PAGES_ACCESS_PERMISSION });
  return "granted";
};

const removeAccess = async (
  client: GitHubClient,
  owner: string,
  repo: string,
  username: string
): Promise<"removed" | "unchanged"> => {
  const current = await client.getCollaboratorPermission(owner, repo, username);
  if (current.permission === "none") return "unchanged";
  await client.removeCollaborator({ owner, repo, username });
  return "removed";
};

const applyPlan = async (
  client: GitHubClient,
  pagesRepository: string,
  plan: AccessPlan
): Promise<Pick<PagesAccessResult, "granted" | "removed" | "failed">> => {
  const [owner = "", repo = ""] = pagesRepository.split("/");
  const granted: string[] = [];
  const removed: string[] = [];
  const failed: PagesAccessFailure[] = [];
  for (const username of plan.keep) {
    try {
      if ((await grantAccess(client, owner, repo, username)) === "granted") granted.push(username);
    } catch {
      failed.push({ githubUsername: username, action: "grant" });
    }
  }
  for (const username of plan.remove) {
    try {
      if ((await removeAccess(client, owner, repo, username)) === "removed") removed.push(username);
    } catch {
      failed.push({ githubUsername: username, action: "remove" });
    }
  }
  return { granted, removed, failed };
};

export const syncStudentPagesAccess = async (
  request: PagesAccessRequest,
  token: string,
  overrides: Partial<PagesAccessDependencies> = {}
): Promise<PagesAccessResult> => {
  const resolved = { ...defaultDependencies, ...overrides };
  const course = loadCourseConfig(path.join(request.courseFolderPath, "course.yml"));
  if (course.status !== "success")
    return emptyResult("failure", null, [
      "Unable to load course.yml, so student access to the Pages site was not checked."
    ]);
  const pagesRepository = course.value.notifications?.student_access_pages?.repository ?? null;
  if (pagesRepository === null) return emptyResult("not_configured", null, []);
  const term = findMostRecentTerm(request.courseFolderPath);
  if (term === null)
    return emptyResult("failure", pagesRepository, [
      "Unable to determine the most recent term, so student access to the Pages site was not checked."
    ]);
  const plan = planAccess(request.courseFolderPath, term, request.removedStudents);
  const outcome = await applyPlan(resolved.createClient({ token }), pagesRepository, plan);
  return {
    status: outcome.failed.length === 0 ? "success" : "partial_failure",
    pagesRepository,
    termCode: term.code,
    ...outcome,
    diagnostics: plan.diagnostics
  };
};

export const pagesAccessBackend = {
  syncStudentPagesAccess
};
