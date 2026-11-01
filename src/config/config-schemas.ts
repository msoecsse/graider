import { z } from "zod";
import { isGithubUsername } from "../roster/roster-validation.js";

const MINIMUM_LIST_ITEMS = 1;

export const SUPPORTED_SCHEMA_VERSION = 1;
export const COURSE_SCHEMA_VERSION_V2 = 2;
export const TERM_SCHEMA_VERSION_V2 = 2;
// Parsing support is independent of production authorization readiness.
export const OPERATIONAL_COURSE_SCHEMA_VERSION = SUPPORTED_SCHEMA_VERSION;
export const OPERATIONAL_TERM_SCHEMA_VERSION = SUPPORTED_SCHEMA_VERSION;
export const SUPPORTED_ASSIGNMENT_TYPE = "individual";
export const SUPPORTED_REPOSITORY_VISIBILITY = "private";
export const STUDENT_PERMISSION = "admin";
export const FACULTY_PERMISSION = "admin";
export const VALID_ASSIGNMENT_STATUSES = ["draft", "active", "closed", "archived"] as const;
export const TERM_LIFECYCLE_STATUSES = ["draft", "active", "archived"] as const;
export const ENABLED_GRADING_MODES = ["preset", "custom-workflow", "contract-only"] as const;
export const DISABLED_GRADING_MODE = "no-grading";
export const SUPPORTED_GRADING_PRESETS = ["java-junit-checkstyle"] as const;
export const ENABLED_STUDENT_PUBLISH_MODES = [
  "graider-generated",
  "faculty-provided",
  "both"
] as const;
export const DISABLED_STUDENT_PUBLISH_MODE = "disabled";
export const TERM_CODE_PATTERN = /^\d{2}s[123]$/;

const gradingFields = {
  mode: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  preset: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  workflow: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  artifact: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  result_file: z.string().min(MINIMUM_LIST_ITEMS).optional()
};

const gradingSchema = z.object({ enabled: z.boolean(), ...gradingFields }).strict();

const assignmentGradingSchema = z
  .object({
    enabled: z.boolean().optional(),
    ...gradingFields,
    required_files: z.array(z.string().trim().min(MINIMUM_LIST_ITEMS)).optional(),
    rubric: z
      .array(
        z
          .object({
            id: z.string().trim().min(MINIMUM_LIST_ITEMS),
            name: z.string().trim().min(MINIMUM_LIST_ITEMS),
            points: z.number()
          })
          .strict()
      )
      .optional()
  })
  .strict();

const studentPublishSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.string().min(MINIMUM_LIST_ITEMS).optional(),
    source: z.string().min(MINIMUM_LIST_ITEMS).optional(),
    artifact: z.string().min(MINIMUM_LIST_ITEMS).optional(),
    source_file: z.string().min(MINIMUM_LIST_ITEMS).optional(),
    destination_file: z.string().min(MINIMUM_LIST_ITEMS).optional(),
    graider_report_destination: z.string().min(MINIMUM_LIST_ITEMS).optional(),
    faculty_report_source: z.string().min(MINIMUM_LIST_ITEMS).optional(),
    faculty_report_destination: z.string().min(MINIMUM_LIST_ITEMS).optional()
  })
  .strict();

const reportsSchema = z
  .object({
    formats: z.array(z.string().min(MINIMUM_LIST_ITEMS)).min(MINIMUM_LIST_ITEMS),
    student_publish: studentPublishSchema.optional()
  })
  .strict();

const studentAccessPagesSchema = z
  .object({
    repository: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u),
    base_url: z.url().refine((value) => new URL(value).protocol === "https:"),
    branch: z.string().min(MINIMUM_LIST_ITEMS).default("main")
  })
  .strict();

const notificationsSchema = z
  .object({
    student_access_pages: studentAccessPagesSchema.optional()
  })
  .strict();

const courseConfigFields = {
  course: z
    .object({
      code: z.string().min(MINIMUM_LIST_ITEMS),
      title: z.string().min(MINIMUM_LIST_ITEMS),
      repository: z.string().min(MINIMUM_LIST_ITEMS)
    })
    .strict(),
  github: z
    .object({
      organization: z.string().min(MINIMUM_LIST_ITEMS),
      repository_visibility: z.string().min(MINIMUM_LIST_ITEMS),
      repo_name_pattern: z.string().min(MINIMUM_LIST_ITEMS),
      student_permission: z.string().min(MINIMUM_LIST_ITEMS),
      faculty_team: z.string().min(MINIMUM_LIST_ITEMS),
      faculty_permission: z.string().min(MINIMUM_LIST_ITEMS)
    })
    .strict(),
  defaults: z
    .object({
      timezone: z.string().min(MINIMUM_LIST_ITEMS),
      assignment_type: z.string().min(MINIMUM_LIST_ITEMS)
    })
    .strict(),
  grading: gradingSchema.optional(),
  reports: reportsSchema,
  notifications: notificationsSchema.optional()
};

const githubLoginSchema = z.string().refine((value) => isGithubUsername(value.toLowerCase()), {
  message: "Invalid GitHub login."
});

const githubUserIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const facultyIdentitySchema = z
  .object({
    institutional_username: z
      .string()
      .min(MINIMUM_LIST_ITEMS)
      .regex(/^[^\s\p{C}]+$/u),
    github_user_id: githubUserIdSchema,
    github_login: githubLoginSchema,
    github_login_history: z.array(githubLoginSchema).default([])
  })
  .strict();

const facultyDirectorySchema = z
  .array(facultyIdentitySchema)
  .min(MINIMUM_LIST_ITEMS)
  .superRefine((records, context) => {
    const usernames = new Set<string>();
    const ids = new Set<number>();
    const logins = new Set<string>();
    records.forEach((record, index) => {
      const keys = [
        ["institutional_username", record.institutional_username.toLowerCase(), usernames],
        ["github_login", record.github_login.toLowerCase(), logins]
      ] as const;
      keys.forEach(([field, value, seen]) => {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [index, field],
            message: `Duplicate ${field}.`
          });
        }
        seen.add(value);
      });
      if (ids.has(record.github_user_id)) {
        context.addIssue({
          code: "custom",
          path: [index, "github_user_id"],
          message: "Duplicate GitHub user ID."
        });
      }
      ids.add(record.github_user_id);
    });
  });

export const rawCourseConfigV1Schema = z
  .object({
    schema_version: z.literal(SUPPORTED_SCHEMA_VERSION),
    ...courseConfigFields,
    github: courseConfigFields.github.extend({
      // Deprecated v1 compatibility data only. Never used for authorization or Apply.
      // Phase 9.4 removes persisted fields during explicit migration.
      grader_team: z.string().min(MINIMUM_LIST_ITEMS).optional(),
      grader_permission: z.string().min(MINIMUM_LIST_ITEMS).optional()
    })
  })
  .strict();

export const rawCourseConfigV2Schema = z
  .object({
    schema_version: z.literal(COURSE_SCHEMA_VERSION_V2),
    ...courseConfigFields,
    faculty_directory: facultyDirectorySchema,
    fallback_administrator: z.object({ github_user_id: githubUserIdSchema }).strict()
  })
  .strict()
  .refine(
    (course) =>
      course.faculty_directory.some(
        (faculty) => faculty.github_user_id === course.fallback_administrator.github_user_id
      ),
    {
      path: ["fallback_administrator", "github_user_id"],
      message: "Fallback administrator must reference an existing faculty directory member."
    }
  );

export const rawCourseConfigSchema = z.discriminatedUnion("schema_version", [
  rawCourseConfigV1Schema,
  rawCourseConfigV2Schema
]);

const termConfigFields = {
  term: z
    .object({
      code: z.string().min(MINIMUM_LIST_ITEMS),
      academic_year: z.number(),
      semester: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      display_name: z.string().min(MINIMUM_LIST_ITEMS)
    })
    .strict()
};

const sectionConfigFields = {
  id: z.string().min(MINIMUM_LIST_ITEMS),
  roster: z.string().min(MINIMUM_LIST_ITEMS).optional()
};

const facultyReferenceSchema = z.object({ github_user_id: githubUserIdSchema }).strict();
const facultyRoleHistorySchema = (roleName: string) =>
  z
    .object({
      current: z.array(facultyReferenceSchema),
      former: z.array(facultyReferenceSchema)
    })
    .strict()
    .superRefine((history, context) => {
      const seen = new Set<number>();
      for (const role of ["current", "former"] as const) {
        history[role].forEach((reference, index) => {
          if (seen.has(reference.github_user_id)) {
            context.addIssue({
              code: "custom",
              path: [role, index, "github_user_id"],
              message: `${roleName} IDs must be unique across current and former roles.`
            });
          }
          seen.add(reference.github_user_id);
        });
      }
    });

export const rawTermConfigV1Schema = z
  .object({
    schema_version: z.literal(SUPPORTED_SCHEMA_VERSION),
    ...termConfigFields,
    sections: z
      .array(
        z
          .object({
            ...sectionConfigFields,
            faculty: z.array(z.string().min(MINIMUM_LIST_ITEMS)).optional()
          })
          .strict()
      )
      .min(MINIMUM_LIST_ITEMS)
  })
  .strict();

export const rawTermConfigV2Schema = z
  .object({
    schema_version: z.literal(TERM_SCHEMA_VERSION_V2),
    term: termConfigFields.term.extend({ status: z.enum(TERM_LIFECYCLE_STATUSES) }),
    coordinators: facultyRoleHistorySchema("Coordinator"),
    sections: z
      .array(
        z
          .object({
            ...sectionConfigFields,
            faculty: facultyRoleHistorySchema("Section faculty")
          })
          .strict()
      )
      .min(MINIMUM_LIST_ITEMS)
  })
  .strict();

export const rawTermConfigSchema = z.discriminatedUnion("schema_version", [
  rawTermConfigV1Schema,
  rawTermConfigV2Schema
]);

export const rawAssignmentConfigSchema = z
  .object({
    schema_version: z.number(),
    assignment: z
      .object({
        slug: z.string().min(MINIMUM_LIST_ITEMS),
        title: z.string().min(MINIMUM_LIST_ITEMS),
        type: z.string().min(MINIMUM_LIST_ITEMS),
        status: z.string().min(MINIMUM_LIST_ITEMS)
      })
      .strict(),
    template: z
      .object({
        repository: z.string().min(MINIMUM_LIST_ITEMS),
        branch: z.string().min(MINIMUM_LIST_ITEMS)
      })
      .strict()
      .optional(),
    sections: z.array(z.string().min(MINIMUM_LIST_ITEMS)).min(MINIMUM_LIST_ITEMS),
    deadline: z
      .object({
        due_at: z.string().min(MINIMUM_LIST_ITEMS),
        late_policy: z.string().min(MINIMUM_LIST_ITEMS)
      })
      .strict()
      .optional(),
    metadata: z
      .object({
        faculty_owner: z.string().min(MINIMUM_LIST_ITEMS).optional(),
        lms_assignment_id: z.string().nullable().optional(),
        grading_category: z.string().min(MINIMUM_LIST_ITEMS).optional(),
        points: z.number().nullable().optional()
      })
      .strict()
      .optional(),
    grading: assignmentGradingSchema.optional(),
    repository_mode: z.enum(["individual", "group"]).optional(),
    groups: z
      .object({
        file: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/u)
      })
      .strict()
      .optional()
  })
  .strict();
