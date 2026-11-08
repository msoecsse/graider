import fs from "node:fs";
import path from "node:path";
import { loadTermRosters } from "../../src/roster/roster-loader.js";
import { loadCommentLibrary } from "../../src/grading/comment-library.js";
import { createRosterSummary } from "../../src/roster/roster-models.js";
import { parseCourseConfig } from "../../src/config/load-course-config.js";
import { parseTermConfig } from "../../src/config/load-term-config.js";
import {
  validateAssignmentConfig,
  validateCourseConfig,
  validateTermConfig
} from "../../src/config/config-validation.js";
import {
  rawAssignmentConfigSchema,
  COURSE_SCHEMA_VERSION_V2,
  OPERATIONAL_DISCOVERY_SCHEMA_VERSIONS,
  OPERATIONAL_MANAGED_SCHEMA_VERSIONS,
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION
} from "../../src/config/config-schemas.js";
import { parseYaml } from "../../src/io/stable-yaml.js";
import { resolveFacultyScope } from "../../src/faculty/faculty-scope-resolver.js";
import { FacultyDirectory } from "../../src/faculty/faculty-directory.js";
import { FallbackAdministrator } from "../../src/faculty/fallback-administrator.js";
import { AuthorizationResolver } from "../../src/faculty/authorization-resolver.js";
import { DraftTermAuthorizationResolver } from "../../src/faculty/draft-term-authorization-resolver.js";
import { ArchivedTermAuthorizationResolver } from "../../src/faculty/archived-term-authorization-resolver.js";
import { CourseLifecycle } from "../../src/courses/course-lifecycle.js";
import {
  migrationCourseSchema,
  migrationAssignmentSchema
} from "../../src/migration/migration-candidate-schemas.js";
import type { RawTermConfigV2 } from "../../src/config/config-models.js";

const inspectCourseMetadata = (content: string, operationalSchemas: readonly number[] | null) => {
  const yaml = parseYaml(content, "course.yml");
  if (
    yaml.status !== "success" ||
    !yaml.value ||
    typeof yaml.value !== "object" ||
    !("schema_version" in yaml.value) ||
    typeof yaml.value.schema_version !== "number"
  )
    return { status: "invalid_metadata" as const };
  if (
    ![OPERATIONAL_COURSE_SCHEMA_VERSION, COURSE_SCHEMA_VERSION_V2].includes(
      yaml.value.schema_version
    )
  )
    return { status: "unsupported_schema" as const };
  if (!operationalSchemas?.includes(yaml.value.schema_version))
    return { status: "client_incompatible" as const };
  const parsed = parseCourseConfig(content, "course.yml");
  if (
    parsed.status === "failure" ||
    validateCourseConfig("course.yml", parsed.value, parsed.value.schema_version).length > 0
  )
    return { status: "invalid_metadata" as const };
  if (
    parsed.value.schema_version === COURSE_SCHEMA_VERSION_V2 &&
    !migrationCourseSchema.safeParse(parsed.value).success
  )
    return { status: "invalid_metadata" as const };
  return {
    status: "valid" as const,
    code: parsed.value.course.code,
    title: parsed.value.course.title,
    schemaVersion: parsed.value.schema_version,
    configuredRepository: parsed.value.course.repository,
    organization: parsed.value.github.organization,
    lifecycle:
      parsed.value.schema_version === COURSE_SCHEMA_VERSION_V2
        ? parsed.value.course.lifecycle
        : undefined
  };
};

const inspectTermFacultyMetadata = (content: string, termCode: string, username: string) => {
  const metadataPath = `terms/${termCode}/term.yml`;
  const parsed = parseTermConfig(content, metadataPath);
  if (
    parsed.status === "failure" ||
    parsed.value.schema_version !== OPERATIONAL_TERM_SCHEMA_VERSION ||
    validateTermConfig(metadataPath, parsed.value, termCode).length > 0
  )
    return "invalid_metadata" as const;
  // Faculty assignment resolution is independent of roster data. Do not load student data.
  const scope = resolveFacultyScope(
    username,
    parsed.value.sections.map((section) => ({
      id: section.id,
      ...(section.faculty === undefined ? {} : { faculty: section.faculty })
    })),
    { students: [], errors: [], warnings: [], summary: createRosterSummary([], []) }
  );
  return scope.status === "success" ? ("authorized" as const) : ("not_authorized" as const);
};

export const inspectCourse = (
  content: string,
  operationalSchemas: readonly number[] | null = OPERATIONAL_DISCOVERY_SCHEMA_VERSIONS
) => {
  try {
    return inspectCourseMetadata(content, operationalSchemas);
  } catch {
    return { status: "invalid_metadata" as const };
  }
};
export const inspectOperationCourse = (content: string) =>
  inspectCourse(content, [OPERATIONAL_COURSE_SCHEMA_VERSION]);
export const inspectManagedOperationCourse = (
  content: string,
  schemas: readonly number[] | null = OPERATIONAL_MANAGED_SCHEMA_VERSIONS
) => inspectCourse(content, schemas);

/** Trusted metadata projection. The caller proves exact remote revision and account freshness.
 * This capability authorizes metadata reads only; it never enables a legacy operation on v2.
 */
export const inspectAccess = (
  content: string,
  termContents: Readonly<Record<string, string | null>>,
  identity: {
    readonly userId: number;
    readonly username: string | null;
    readonly repositoryId: number;
    readonly organizationId: number;
    readonly organizationLogin: string;
  }
) => {
  const invalid = { status: "invalid_metadata" as const };
  const metadata = inspectCourse(content);
  if (metadata.status !== "valid") return metadata;
  const parsed = parseCourseConfig(content, "course.yml");
  if (parsed.status !== "success") return invalid;
  try {
    if (parsed.value.schema_version === OPERATIONAL_COURSE_SCHEMA_VERSION) {
      if (metadata.organization.toLowerCase() !== identity.organizationLogin.toLowerCase())
        return { status: "identity_mismatch" as const };
      const results = Object.entries(termContents).map(([code, text]) => ({
        code,
        result:
          text === null
            ? "invalid_metadata"
            : inspectTermFaculty(text, code, identity.username ?? "")
      }));
      const incomplete = results.some(({ result }) => result === "invalid_metadata");
      return {
        status: "valid" as const,
        schemaVersion: parsed.value.schema_version,
        authorization:
          identity.username === null
            ? ("faculty_identity_required" as const)
            : results.some(({ result }) => result === "authorized")
              ? ("authorized" as const)
              : incomplete
                ? ("unavailable" as const)
                : ("not_authorized" as const),
        incomplete,
        terms: results
          .filter(({ result }) => result === "authorized")
          .map(({ code }) => ({ code, visibleSectionIds: [] as string[] }))
      };
    }
    const course = migrationCourseSchema.parse(parsed.value);
    if (
      course.course.organization_binding.organization_login.toLowerCase() !==
      course.github.organization.toLowerCase()
    )
      return invalid;
    if (
      course.course.repository_id !== identity.repositoryId ||
      course.course.organization_binding.organization_id !== identity.organizationId
    )
      return { status: "identity_mismatch" as const };
    const terms: RawTermConfigV2[] = Object.entries(termContents).map(([code, text]) => {
      const term = text === null ? null : parseTermConfig(text, `terms/${code}/term.yml`);
      if (
        !term ||
        term.status !== "success" ||
        term.value.schema_version !== COURSE_SCHEMA_VERSION_V2 ||
        validateTermConfig(`terms/${code}/term.yml`, term.value, code, COURSE_SCHEMA_VERSION_V2)
          .length
      )
        throw new Error("Invalid v2 term.");
      return term.value;
    });
    // Complete lifecycle validation also validates every role reference, including unrelated history.
    new CourseLifecycle(course, terms);
    const directoryMember = new FacultyDirectory(course).resolveByGithubUserId(identity.userId);
    const visible = terms.flatMap((term) => {
      const roles = new AuthorizationResolver(course, term, identity.userId);
      if (term.term.status === "draft") {
        const draft = new DraftTermAuthorizationResolver(
          course,
          terms,
          term.term.code,
          identity.userId
        );
        return draft.canViewDraftTerm().allowed
          ? [
              {
                code: term.term.code,
                visibleSectionIds: [...draft.getDraftSectionScope().visibleSectionIds]
              }
            ]
          : [];
      }
      if (term.term.status === "archived") {
        const archived = new ArchivedTermAuthorizationResolver(
          course,
          terms,
          term.term.code,
          identity.userId
        );
        return archived.canViewArchivedTerm().allowed
          ? [
              {
                code: term.term.code,
                visibleSectionIds: [...archived.getArchivedSectionScope().visibleSectionIds]
              }
            ]
          : [];
      }
      return roles.canViewTerm().allowed || roles.hasFallbackAdministration().allowed
        ? [
            {
              code: term.term.code,
              visibleSectionIds: [...roles.getSectionScope().visibleSectionIds]
            }
          ]
        : [];
    });
    const fallback = new FallbackAdministrator(course).isFallbackAdministrator(identity.userId);
    return {
      status: "valid" as const,
      schemaVersion: course.schema_version,
      authorization:
        directoryMember && (visible.length || fallback)
          ? ("authorized" as const)
          : ("not_authorized" as const),
      incomplete: false,
      terms: directoryMember ? visible : []
    };
  } catch {
    return invalid;
  }
};
export const inspectTermFaculty = (content: string, termCode: string, username: string) => {
  try {
    return inspectTermFacultyMetadata(content, termCode, username);
  } catch {
    return "invalid_metadata" as const;
  }
};

/** Metadata-only managed course navigation; never loads student repositories or grading state. */
export const inspectAssignment = (
  content: string,
  slug: string,
  operationalSchemas: readonly number[] = OPERATIONAL_DISCOVERY_SCHEMA_VERSIONS
) => {
  try {
    const yaml = parseYaml(content, "assignment.yml");
    if (
      yaml.status !== "success" ||
      !yaml.value ||
      typeof yaml.value !== "object" ||
      !("schema_version" in yaml.value) ||
      !operationalSchemas.includes(yaml.value.schema_version as number)
    )
      return null;
    const migrated =
      yaml.status === "success" ? migrationAssignmentSchema.safeParse(yaml.value) : null;
    if (migrated?.success)
      return migrated.data.assignment.slug === slug
        ? {
            slug: migrated.data.assignment.slug,
            title: migrated.data.assignment.title,
            status: migrated.data.assignment.lifecycle ?? "needs_attention"
          }
        : null;
    const result =
      yaml.status === "success" ? rawAssignmentConfigSchema.safeParse(yaml.value) : null;
    if (
      !result?.success ||
      validateAssignmentConfig("assignment.yml", result.data, slug).length > 0
    )
      return null;
    return {
      slug: result.data.assignment.slug,
      title: result.data.assignment.title,
      status: result.data.assignment.status
    };
  } catch {
    return null;
  }
};

/** Transaction validation deliberately checks shape, not post-edit faculty membership. */
export const validateTransaction = (root: string, organization: string): void => {
  const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
  const course = inspectOperationCourse(read("course.yml"));
  if (course.status !== "valid" || course.organization.toLowerCase() !== organization.toLowerCase())
    throw new Error("Invalid course metadata or organization binding.");
  for (const term of fs.readdirSync(path.join(root, "terms"))) {
    if (!/^\d{2}s[123]$/u.test(term)) continue;
    const termFile = `terms/${term}/term.yml`;
    const parsed = parseTermConfig(read(termFile), termFile);
    if (parsed.status !== "success" || validateTermConfig(termFile, parsed.value, term).length)
      throw new Error("Invalid term metadata.");
    // Roster paths are validated before the domain loader can traverse them.
    for (const section of parsed.value.sections) {
      if (
        section.roster &&
        (!/^rosters\/[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/u.test(section.roster) ||
          section.roster.includes(".."))
      )
        throw new Error("Unsafe roster path.");
    }
    const rosters = loadTermRosters({
      repoRoot: root,
      termConfigPath: termFile,
      sections: parsed.value.sections,
      sectionIds: parsed.value.sections.map((s) => s.id)
    });
    if (rosters.errors.length) throw new Error("Invalid roster configuration.");
    const directory = path.join(root, "terms", term, "assignments");
    if (!fs.existsSync(directory)) continue;
    for (const slug of fs.readdirSync(directory)) {
      const assignmentFile = path.join(directory, slug, "assignment.yml");
      if (!fs.existsSync(assignmentFile)) continue;
      if (
        !inspectAssignment(fs.readFileSync(assignmentFile, "utf8"), slug, [
          OPERATIONAL_COURSE_SCHEMA_VERSION
        ])
      )
        throw new Error("Invalid assignment metadata.");
    }
  }
  if (loadCommentLibrary(root).status !== "success") throw new Error("Invalid comment library.");
};

export { registerCourseRuntimeRoot } from "../../src/core/course-runtime-paths.js";
export {
  legacyCourseWriteIncompatible,
  legacyCourseContentIncompatible
} from "../../src/config/legacy-course-compatibility.js";
export { readManagedOperationCapabilities as inspectManagedOperationCapabilities } from "./managedOperationBackend.js";
