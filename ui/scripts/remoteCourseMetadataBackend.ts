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
  SUPPORTED_SCHEMA_VERSION
} from "../../src/config/config-schemas.js";
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

/** Metadata-only managed course navigation; never loads student repositories or grading state. */
export const inspectAssignment = (content: string, slug: string) => {
  try {
    const yaml = parseYaml(content, "assignment.yml");
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
  const course = inspectCourse(read("course.yml"));
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
      if (!inspectAssignment(fs.readFileSync(assignmentFile, "utf8"), slug))
        throw new Error("Invalid assignment metadata.");
    }
  }
  if (loadCommentLibrary(root).status !== "success") throw new Error("Invalid comment library.");
};

export { registerCourseRuntimeRoot } from "../../src/core/course-runtime-paths.js";
