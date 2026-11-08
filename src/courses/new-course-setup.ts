import { z } from "zod";
import { stringify } from "yaml";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import {
  migrationCourseSchema,
  migrationSegmentSchema
} from "../migration/migration-candidate-schemas.js";
import { CourseLifecycle } from "./course-lifecycle.js";
import { validateCourseConfig, validateTermConfig } from "../config/config-validation.js";

const nonempty = z.string().trim().min(1);
const selection = z.object({ institutionalUsername: nonempty, githubLogin: nonempty }).strict();
export const newRemoteCourseRequestSchema = z
  .object({
    organization: z.string().regex(/^[A-Za-z0-9-]+$/u),
    repositoryName: migrationSegmentSchema.refine((value) => /^[A-Za-z0-9._-]+$/u.test(value)),
    courseCode: nonempty,
    courseTitle: nonempty,
    creatorInstitutionalUsername: nonempty,
    termCode: z.string().regex(/^\d{2}s[123]$/u),
    coordinators: z.array(selection).min(1),
    sections: z
      .array(
        z
          .object({
            id: migrationSegmentSchema.refine((value) => /^[A-Za-z0-9_-]+$/u.test(value)),
            faculty: z.array(selection)
          })
          .strict()
      )
      .min(1)
      .refine(
        (sections) =>
          new Set(sections.map((section) => section.id.toLowerCase())).size === sections.length,
        "Section IDs must be unique on both supported platforms."
      )
  })
  .strict();
export type NewRemoteCourseRequest = z.infer<typeof newRemoteCourseRequestSchema>;
export interface VerifiedSetupFaculty {
  readonly institutionalUsername: string;
  readonly githubUserId: number;
  readonly githubLogin: string;
}
export const validateSetupDirectory = (faculty: readonly VerifiedSetupFaculty[]) => {
  const unique = new Map<number, VerifiedSetupFaculty>();
  for (const person of faculty) {
    const previous = unique.get(person.githubUserId);
    if (
      previous &&
      (previous.institutionalUsername !== person.institutionalUsername ||
        previous.githubLogin !== person.githubLogin)
    )
      throw new Error("Conflicting identity selections.");
    unique.set(person.githubUserId, person);
  }
  return rawCourseConfigV2Schema.shape.faculty_directory.parse(
    [...unique.values()].map((person) => ({
      institutional_username: person.institutionalUsername,
      github_user_id: person.githubUserId,
      github_login: person.githubLogin,
      github_login_history: []
    }))
  );
};
const CENTURY_BASE = 2000;
const TERM_YEAR_LENGTH = 2;
const FALL_SEMESTER = 1;
const SPRING_SEMESTER = 2;
const SEMESTER_CODE_OFFSET = 3;

/** Pure canonical serialization. Its trusted inputs are supplied only by the main-owned review. */
export const buildNewCourseMetadata = (
  request: NewRemoteCourseRequest,
  trusted: {
    readonly repositoryId: number;
    readonly repositoryName: string;
    readonly organizationId: number;
    readonly organizationLogin: string;
    readonly creator: VerifiedSetupFaculty;
    readonly coordinators: readonly VerifiedSetupFaculty[];
    readonly sectionFaculty: Readonly<Record<string, readonly VerifiedSetupFaculty[]>>;
  }
) => {
  newRemoteCourseRequestSchema.parse(request);
  if (!trusted.coordinators.length || trusted.coordinators.length !== request.coordinators.length)
    throw new Error("Select at least one verified coordinator.");
  const directory = new Map<number, VerifiedSetupFaculty>();
  const all = [
    trusted.creator,
    ...trusted.coordinators,
    ...request.sections.flatMap((section) => {
      const faculty = trusted.sectionFaculty[section.id];
      if (!faculty || faculty.length !== section.faculty.length)
        throw new Error("Unverified section faculty.");
      return faculty;
    })
  ];
  for (const faculty of all) {
    const existing = directory.get(faculty.githubUserId);
    if (
      existing &&
      (existing.institutionalUsername !== faculty.institutionalUsername ||
        existing.githubLogin !== faculty.githubLogin)
    )
      throw new Error("Conflicting faculty directory metadata.");
    directory.set(faculty.githubUserId, faculty);
  }
  const course = migrationCourseSchema.parse({
    schema_version: 2,
    course: {
      repository_id: trusted.repositoryId,
      code: request.courseCode,
      title: request.courseTitle,
      repository: trusted.repositoryName,
      lifecycle: "unarchived",
      term_creation_order: [request.termCode],
      organization_binding: {
        organization_id: trusted.organizationId,
        organization_login: trusted.organizationLogin
      }
    },
    github: {
      organization: trusted.organizationLogin,
      repository_visibility: "private",
      repo_name_pattern: "{term}-{course}-{assignment}-{github_username}",
      student_permission: "admin",
      faculty_team: "faculty",
      faculty_permission: "admin"
    },
    defaults: { timezone: "America/Chicago", assignment_type: "individual" },
    reports: { formats: ["markdown", "csv", "json"] },
    faculty_directory: validateSetupDirectory([...directory.values()]),
    fallback_administrator: { github_user_id: trusted.creator.githubUserId }
  });
  const year = CENTURY_BASE + Number(request.termCode.slice(0, TERM_YEAR_LENGTH));
  const semester = Number(request.termCode.slice(SEMESTER_CODE_OFFSET));
  const term = rawTermConfigV2Schema.parse({
    schema_version: 2,
    term: {
      code: request.termCode,
      academic_year: year,
      semester,
      display_name:
        semester === FALL_SEMESTER
          ? `Fall ${String(year - 1)}`
          : semester === SPRING_SEMESTER
            ? `Spring ${String(year)}`
            : `Summer ${String(year)}`,
      status: "draft",
      has_ever_been_active: false
    },
    coordinators: {
      current: trusted.coordinators.map((faculty) => ({ github_user_id: faculty.githubUserId })),
      former: []
    },
    sections: request.sections.map((section) => ({
      id: section.id,
      faculty: {
        current: (trusted.sectionFaculty[section.id] ?? []).map((faculty) => ({
          github_user_id: faculty.githubUserId
        })),
        former: []
      }
    }))
  });
  new CourseLifecycle(course, [term]);
  if (
    validateCourseConfig("course.yml", course, 2).length ||
    validateTermConfig(`terms/${request.termCode}/term.yml`, term, request.termCode, 2).length
  )
    throw new Error("Invalid canonical course or term configuration.");
  return {
    course,
    term,
    files: [
      { path: "course.yml", content: stringify(course) },
      { path: `terms/${request.termCode}/term.yml`, content: stringify(term) }
    ]
  };
};
