import { z } from "zod";

const MINIMUM_LIST_ITEMS = 1;

export const SUPPORTED_SCHEMA_VERSION = 1;
export const SUPPORTED_ASSIGNMENT_TYPE = "individual";
export const SUPPORTED_REPOSITORY_VISIBILITY = "private";
export const STUDENT_PERMISSION = "push";
export const FACULTY_PERMISSION = "admin";
export const GRADER_PERMISSION = "maintain";
export const VALID_ASSIGNMENT_STATUSES = ["draft", "active", "closed", "archived"] as const;
export const TERM_CODE_PATTERN = /^\d{2}s[123]$/;

const gradingSchema = z
  .object({
    enabled: z.boolean(),
    workflow: z.string().min(MINIMUM_LIST_ITEMS).optional(),
    artifact: z.string().min(MINIMUM_LIST_ITEMS).optional(),
    result_file: z.string().min(MINIMUM_LIST_ITEMS).optional()
  })
  .strict();

export const rawCourseConfigSchema = z
  .object({
    schema_version: z.number(),
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
        faculty_permission: z.string().min(MINIMUM_LIST_ITEMS),
        grader_team: z.string().min(MINIMUM_LIST_ITEMS),
        grader_permission: z.string().min(MINIMUM_LIST_ITEMS)
      })
      .strict(),
    defaults: z
      .object({
        timezone: z.string().min(MINIMUM_LIST_ITEMS),
        assignment_type: z.string().min(MINIMUM_LIST_ITEMS)
      })
      .strict(),
    grading: gradingSchema,
    reports: z
      .object({
        formats: z.array(z.string().min(MINIMUM_LIST_ITEMS)).min(MINIMUM_LIST_ITEMS)
      })
      .strict()
  })
  .strict();

export const rawTermConfigSchema = z
  .object({
    schema_version: z.number(),
    term: z
      .object({
        code: z.string().min(MINIMUM_LIST_ITEMS),
        academic_year: z.number(),
        semester: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        display_name: z.string().min(MINIMUM_LIST_ITEMS)
      })
      .strict(),
    sections: z
      .array(
        z
          .object({
            id: z.string().min(MINIMUM_LIST_ITEMS),
            roster: z.string().min(MINIMUM_LIST_ITEMS)
          })
          .strict()
      )
      .min(MINIMUM_LIST_ITEMS)
  })
  .strict();

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
      .strict(),
    sections: z.array(z.string().min(MINIMUM_LIST_ITEMS)).min(MINIMUM_LIST_ITEMS),
    deadline: z
      .object({
        due_at: z.string().min(MINIMUM_LIST_ITEMS),
        late_policy: z.string().min(MINIMUM_LIST_ITEMS)
      })
      .strict(),
    metadata: z
      .object({
        faculty_owner: z.string().min(MINIMUM_LIST_ITEMS),
        lms_assignment_id: z.string().nullable(),
        grading_category: z.string().min(MINIMUM_LIST_ITEMS),
        points: z.number().nullable()
      })
      .strict(),
    grading: gradingSchema.optional()
  })
  .strict();
