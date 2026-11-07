import { stringify } from "yaml";

/** Fictional authoritative metadata only; no live accounts or repositories. */
export const schemaTwoCourse = () => ({
  schema_version: 2,
  course: {
    code: "fixture101",
    title: "Schema Two",
    repository: "course",
    repository_id: 20,
    organization_binding: { organization_id: 10, organization_login: "fixture" },
    lifecycle: "unarchived",
    term_creation_order: ["27s1"]
  },
  github: {
    organization: "fixture",
    repository_visibility: "private",
    repo_name_pattern: "{term}-{course}-{assignment}-{github_username}",
    student_permission: "admin",
    faculty_team: "faculty",
    faculty_permission: "admin"
  },
  defaults: { timezone: "America/Chicago", assignment_type: "individual" },
  reports: { formats: ["markdown"] },
  faculty_directory: [42, 43, 44, 45, 46, 47].map((id) => ({
    institutional_username: `faculty${id}`,
    github_user_id: id,
    github_login: `login${id}`,
    github_login_history: []
  })),
  fallback_administrator: { github_user_id: 46 }
});

export const schemaTwoTerm = (status = "active", code = "27s1") => ({
  schema_version: 2,
  term: {
    code,
    academic_year: 2027,
    semester: 1,
    display_name: "Fictional term",
    status,
    has_ever_been_active: status !== "draft"
  },
  coordinators: { current: [{ github_user_id: 44 }], former: [{ github_user_id: 45 }] },
  sections: [
    {
      id: "001",
      faculty: { current: [{ github_user_id: 42 }], former: [{ github_user_id: 43 }] }
    },
    { id: "002", faculty: { current: [], former: [] } }
  ]
});
export const accessIdentity = (userId = 42) => ({
  userId,
  username: null as string | null,
  repositoryId: 20,
  organizationId: 10,
  organizationLogin: "fixture"
});
export { stringify as metadataYaml };
