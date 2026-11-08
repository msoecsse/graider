import { describe, expect, it } from "vitest";
import {
  buildNewCourseMetadata,
  newRemoteCourseRequestSchema
} from "../../../src/courses/new-course-setup.js";
import { AuthorizationResolver } from "../../../src/faculty/authorization-resolver.js";

const creator = {
  institutionalUsername: "creator",
  githubUserId: 11,
  githubLogin: "creator-login"
};
const coordinator = {
  institutionalUsername: "coordinator",
  githubUserId: 12,
  githubLogin: "coordinator-login"
};
const teacher = {
  institutionalUsername: "teacher",
  githubUserId: 13,
  githubLogin: "teacher-login"
};
const request = {
  organization: "fixture",
  repositoryName: "course",
  courseCode: "CSC",
  courseTitle: "Course",
  creatorInstitutionalUsername: "creator",
  termCode: "27s1",
  coordinators: [
    {
      institutionalUsername: coordinator.institutionalUsername,
      githubLogin: coordinator.githubLogin
    }
  ],
  sections: [
    {
      id: "001",
      faculty: [
        { institutionalUsername: teacher.institutionalUsername, githubLogin: teacher.githubLogin }
      ]
    }
  ]
};
const trusted = {
  repositoryId: 100,
  repositoryName: "course",
  organizationId: 200,
  organizationLogin: "fixture",
  creator,
  coordinators: [coordinator],
  sectionFaculty: { "001": [teacher] }
};
describe("new remote course canonical setup", () => {
  it("creates an unarchived Schema 2 course and never-Active Draft without migration", () => {
    const result = buildNewCourseMetadata(request, trusted);
    expect(result.course.course).toMatchObject({
      repository_id: 100,
      lifecycle: "unarchived",
      term_creation_order: ["27s1"]
    });
    expect(result.term.term).toMatchObject({ status: "draft", has_ever_been_active: false });
    expect(result.files.map((file) => file.path)).toEqual(["course.yml", "terms/27s1/term.yml"]);
    const roles = new AuthorizationResolver(result.course, result.term, creator.githubUserId);
    expect(roles.roleFacts).toMatchObject({
      fallbackAdministrator: true,
      currentCoordinator: false,
      currentFacultySectionIds: []
    });
    expect(
      new AuthorizationResolver(
        result.course,
        result.term,
        coordinator.githubUserId
      ).getSectionScope().visibleSectionIds
    ).toEqual([]);
  });
  it("permits explicitly selecting the creator as coordinator, independently of teaching", () => {
    const result = buildNewCourseMetadata(
      {
        ...request,
        coordinators: [{ institutionalUsername: "creator", githubLogin: "creator-login" }]
      },
      { ...trusted, coordinators: [creator] }
    );
    expect(result.term.coordinators.current).toEqual([{ github_user_id: creator.githubUserId }]);
    expect(result.term.sections[0]?.faculty.current).toEqual([
      { github_user_id: teacher.githubUserId }
    ]);
  });
  it("rejects zero coordinators, unverified faculty, duplicate sections and renderer evidence", () => {
    expect(() => buildNewCourseMetadata(request, { ...trusted, coordinators: [] })).toThrow();
    expect(() => buildNewCourseMetadata(request, { ...trusted, sectionFaculty: {} })).toThrow();
    expect(() =>
      buildNewCourseMetadata(
        { ...request, sections: [...request.sections, ...request.sections] },
        trusted
      )
    ).toThrow();
    expect(
      newRemoteCourseRequestSchema.safeParse({ ...request, creatorGithubUserId: 99 }).success
    ).toBe(false);
    expect(
      newRemoteCourseRequestSchema.safeParse({
        ...request,
        coordinators: [{ ...request.coordinators[0], verified: true }]
      }).success
    ).toBe(false);
    expect(
      newRemoteCourseRequestSchema.safeParse({
        ...request,
        sections: [
          { id: "sectionA", faculty: [] },
          { id: "sectiona", faculty: [] }
        ]
      }).success
    ).toBe(false);
  });
});
