import { createRosterSummary } from "../../src/roster/roster-models.js";
import { parseCourseConfig } from "../../src/config/load-course-config.js";
import { parseTermConfig } from "../../src/config/load-term-config.js";
import { validateCourseConfig, validateTermConfig } from "../../src/config/config-validation.js";
import { SUPPORTED_SCHEMA_VERSION } from "../../src/config/config-schemas.js";
import { parseYaml } from "../../src/io/stable-yaml.js";
import { resolveFacultyScope } from "../../src/faculty/faculty-scope-resolver.js";

const inspectCourseMetadata = (content: string) => {
  // Check the version before applying the v1 shape, including future shapes.
  const yaml = parseYaml(content, "course.yml");
  if (
    yaml.status === "success" &&
    yaml.value &&
    typeof yaml.value === "object" &&
    "schema_version" in yaml.value &&
    typeof yaml.value.schema_version === "number" &&
    yaml.value.schema_version !== SUPPORTED_SCHEMA_VERSION
  )
    return { status: "unsupported_schema" as const };
  const parsed = parseCourseConfig(content, "course.yml");
  if (parsed.status === "failure" || validateCourseConfig("course.yml", parsed.value).length > 0)
    return { status: "invalid_metadata" as const };
  return {
    status: "valid" as const,
    code: parsed.value.course.code,
    title: parsed.value.course.title,
    schemaVersion: parsed.value.schema_version,
    configuredRepository: parsed.value.course.repository,
    organization: parsed.value.github.organization
  };
};

const inspectTermFacultyMetadata = (content: string, termCode: string, username: string) => {
  const metadataPath = `terms/${termCode}/term.yml`;
  const parsed = parseTermConfig(content, metadataPath);
  if (
    parsed.status === "failure" ||
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

export const inspectCourse = (content: string) => {
  try {
    return inspectCourseMetadata(content);
  } catch {
    return { status: "invalid_metadata" as const };
  }
};
export const inspectTermFaculty = (content: string, termCode: string, username: string) => {
  try {
    return inspectTermFacultyMetadata(content, termCode, username);
  } catch {
    return "invalid_metadata" as const;
  }
};
