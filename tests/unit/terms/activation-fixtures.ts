import type { RawTermConfigV2 } from "../../../src/config/config-models.js";
import { rawCourseConfigV2Schema } from "../../../src/config/config-schemas.js";
import { FakeStudentPermissionClient } from "../../../src/github/fake-student-permission-client.js";
import { FakeCoursePermissionClient } from "../../../src/github/fake-course-permission-client.js";
import {
  course as baseCourse,
  term,
  secondTerm,
  REPOSITORY_ID,
  FALLBACK,
  COORDINATOR,
  FACULTY,
  FORMER,
  DIRECTORY_ONLY
} from "../github/team-membership-fixtures.js";
export { REPOSITORY_ID, FALLBACK, COORDINATOR, FACULTY, FORMER, DIRECTORY_ONLY };
export const HISTORY_ONLY = 1006;
export const ARCHIVED_FACULTY = 1007;
export const STUDENT_REPOSITORY_ID = 456;
export const course = rawCourseConfigV2Schema.parse({
  ...baseCourse,
  faculty_directory: [
    ...baseCourse.faculty_directory,
    ...[HISTORY_ONLY, ARCHIVED_FACULTY].map((id) => ({
      institutional_username: `institution-${String(id)}`,
      github_user_id: id,
      github_login: `faculty-${String(id)}`,
      github_login_history: []
    }))
  ]
});
export const active = structuredClone(term);
active.coordinators.former.push({ github_user_id: HISTORY_ONLY });
export const draft = structuredClone(secondTerm);
export const archived: RawTermConfigV2 = {
  ...structuredClone(term),
  term: { ...term.term, code: "26s1", status: "archived" },
  sections: [
    { id: "001", faculty: { current: [{ github_user_id: ARCHIVED_FACULTY }], former: [] } }
  ]
};
export const terms = [active, draft, archived];
export const clientFixture = () => {
  const users = course.faculty_directory.map((record) => ({
    id: record.github_user_id,
    username: record.github_login
  }));
  const client = new FakeStudentPermissionClient(users);
  client.scopes = "repo admin:org";
  client.accountId = FALLBACK;
  const org = course.github.organization;
  client.organizationMembers.set(org, users);
  client.addPermissionRepository(REPOSITORY_ID, org, "course-admin");
  client.addPermissionRepository(STUDENT_REPOSITORY_ID, org, "existing-student");
  const fallback = new FakeCoursePermissionClient(users);
  fallback.repository.node_id = `repository-${String(REPOSITORY_ID)}`;
  fallback.repository.owner.login = org;
  fallback.repository.name = "course-admin";
  const combined = Object.assign(client, {
    getCourseFallbackPermissionPage: fallback.getCourseFallbackPermissionPage.bind(fallback),
    setCourseFallbackPermission: fallback.setCourseFallbackPermission.bind(fallback)
  });
  return {
    client: combined,
    fallback,
    users,
    input: {
      course,
      terms,
      activeTermCode: active.term.code,
      courseRepositoryId: REPOSITORY_ID,
      organizationId: client.organizationId,
      authenticatedUserId: FALLBACK,
      studentTargets: [] as unknown[],
      client: combined,
      invitationJournal: new Set<string>(),
      teamCreationJournal: new Set<string>()
    }
  };
};
export const existingStudentTarget = {
  repositoryId: STUDENT_REPOSITORY_ID,
  courseRepositoryId: REPOSITORY_ID,
  organizationId: 200,
  termCode: active.term.code,
  sectionId: "001",
  sectionIds: ["001"],
  mode: "individual",
  assignmentSlug: "lab01",
  targetId: "student-target"
};
