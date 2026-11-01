import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { vi } from "vitest";
import type { RawTermConfigV2 } from "../../../src/config/config-models.js";
import { rawCourseConfigV2Schema } from "../../../src/config/config-schemas.js";
import {
  buildDesiredTeamMemberships,
  managedTeamDisplayName
} from "../../../src/github/desired-team-membership.js";
import { FakeManagedTeamClient } from "../../../src/github/fake-managed-team-client.js";
import { ManagedTeamMembershipReconciler } from "../../../src/github/managed-team-reconciliation.js";
import type { FacultyOrganizationAccess } from "../../../src/github/faculty-organization-access.js";
import {
  renderManagedTeamMetadata,
  type ManagedTeamKind
} from "../../../src/github/managed-team-identity.js";

export const REPOSITORY_ID = 123;
export const COORDINATOR = 1001;
export const FACULTY = 1002;
export const FORMER = 1003;
export const DIRECTORY_ONLY = 1004;
export const FALLBACK = 1005;
export const OUTSIDER = 9001;
export const FIRST_TEAM_ID = 1000;
export const OTHER_REPOSITORY_ID = 456;
export const HTTP_FORBIDDEN = 403;
export const HTTP_CREATED = 201;
export const PAGE_SIZE = 100;
export const course = rawCourseConfigV2Schema.parse({
  ...rawCourseConfigV2Schema.parse(
    parse(readFileSync("tests/fixtures/config/schema-v2-course.yml", "utf8"))
  ),
  faculty_directory: [COORDINATOR, FACULTY, FORMER, DIRECTORY_ONLY, FALLBACK].map((id) => ({
    institutional_username: `institution-${String(id)}`,
    github_user_id: id,
    github_login: `faculty-${String(id)}`,
    github_login_history: [`historical-${String(id)}`]
  })),
  fallback_administrator: { github_user_id: FALLBACK }
});
export const org = course.github.organization;
export const users = [
  ...course.faculty_directory.map((value) => ({
    id: value.github_user_id,
    username: value.github_login
  })),
  { id: OUTSIDER, username: "outsider" }
];
export const term: RawTermConfigV2 = {
  schema_version: 2,
  term: {
    code: "27s1",
    academic_year: 2027,
    semester: 1,
    display_name: "Spring",
    status: "active"
  },
  coordinators: {
    current: [{ github_user_id: COORDINATOR }],
    former: [{ github_user_id: FORMER }]
  },
  sections: [
    {
      id: "001",
      faculty: { current: [{ github_user_id: FACULTY }], former: [{ github_user_id: FORMER }] }
    },
    {
      id: "002",
      faculty: { current: [{ github_user_id: COORDINATOR }], former: [{ github_user_id: FORMER }] }
    }
  ]
};
export const secondTerm: RawTermConfigV2 = {
  ...structuredClone(term),
  term: { code: "27s2", academic_year: 2027, semester: 2, display_name: "Summer", status: "draft" },
  coordinators: { current: [{ github_user_id: FACULTY }], former: [{ github_user_id: FORMER }] },
  sections: [
    {
      id: "001",
      faculty: { current: [{ github_user_id: FORMER }], former: [{ github_user_id: COORDINATOR }] }
    }
  ]
};

const HTTP_OK = 200;
export const response = (data: unknown, status = HTTP_OK, headers = {}) => ({
  status,
  headers,
  data
});
export const fixture = (
  terms: readonly RawTermConfigV2[] = [term],
  journal = new Set<string>()
) => {
  const client = new FakeManagedTeamClient(users);
  const plan = buildDesiredTeamMemberships(course, terms, REPOSITORY_ID);
  plan.forEach((desired, index) =>
    client.organizationTeams.push({
      id: FIRST_TEAM_ID + index,
      org,
      name: managedTeamDisplayName(desired.identity),
      slug: `managed-${String(index)}`,
      description: renderManagedTeamMetadata(desired.identity)
    })
  );
  const accesses: FacultyOrganizationAccess[] = course.faculty_directory.map((value) => ({
    githubUserId: value.github_user_id,
    courseRepositoryId: REPOSITORY_ID,
    organization: org,
    state: "active"
  }));
  const access = { inspect: vi.fn(() => Promise.resolve(accesses)) };
  const context = {
    course,
    terms,
    courseRepositoryId: REPOSITORY_ID,
    authenticatedUserId: client.accountId
  };
  const service = new ManagedTeamMembershipReconciler(client, context, access, journal);
  const target = (kind: ManagedTeamKind, sectionId?: string, termCode = "27s1") => {
    const desired = plan.find(
      (value) =>
        value.identity.kind === kind &&
        (!("termCode" in value.identity) || value.identity.termCode === termCode) &&
        (!("sectionId" in value.identity) || value.identity.sectionId === sectionId)
    );
    if (!desired) throw new Error("Missing test team identity.");
    const team = client.organizationTeams.find(
      (value) => value.description === renderManagedTeamMetadata(desired.identity)
    );
    if (!team) throw new Error("Missing test team.");
    return { desired, team };
  };
  const seedCorrect = () => {
    plan.forEach((desired) => {
      const team = client.organizationTeams.find(
        (value) => value.description === renderManagedTeamMetadata(desired.identity)
      );
      if (!team) throw new Error("Missing test team.");
      client.members.set(
        team.id,
        users.filter((user) => desired.githubUserIds.includes(user.id))
      );
    });
  };
  return { client, plan, accesses, access, context, service, journal, target, seedCorrect };
};
