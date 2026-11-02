import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { loadCourseConfig, parseCourseConfig } from "../../../src/config/load-course-config.js";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { validateCourseConfig } from "../../../src/config/config-validation.js";
import {
  rawCourseConfigV1Schema,
  rawCourseConfigV2Schema
} from "../../../src/config/config-schemas.js";
import { FacultyDirectory } from "../../../src/faculty/faculty-directory.js";

const fixture = fs.readFileSync("tests/fixtures/config/schema-v2-course.yml", "utf8");
const parsed = parseCourseConfig(fixture, "course.yml");
if (parsed.status !== "success" || parsed.value.schema_version !== 2) {
  throw new Error("Invalid schema development fixture.");
}
const course = parsed.value;
const [first, second] = course.faculty_directory;
if (!first || !second) throw new Error("Expected two faculty records.");
const parse = (value: unknown) => parseCourseConfig(stringify(value), "course.yml");
const githubId = first.github_user_id;
const INVALID_LOGIN_LENGTH = 40;
const NEGATIVE_GITHUB_ID = -1;
const FRACTIONAL_GITHUB_ID = 1.5;

describe("versioned course configuration", () => {
  it("preserves every existing v1 field unchanged", () => {
    const content = fs.readFileSync("tests/fixtures/config/valid-course/course.yml", "utf8");
    const result = parseCourseConfig(content, "course.yml");
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.value).toEqual(rawCourseConfigV1Schema.parse(result.value));
      expect(result.value).toEqual({
        ...course,
        course: {
          code: course.course.code,
          title: course.course.title,
          repository: course.course.repository
        },
        schema_version: 1,
        faculty_directory: undefined,
        fallback_administrator: undefined,
        github: { ...course.github, grader_team: "graders", grader_permission: "maintain" }
      });
    }
  });

  it("parses multiple identities and all shared operational fields", () => {
    expect(course.faculty_directory).toHaveLength(2);
    expect(validateCourseConfig("course.yml", course).map((diagnostic) => diagnostic.code)).toEqual(
      ["invalid_schema_version"]
    );
    expect(rawCourseConfigV2Schema.parse(course)).toEqual(course);
    expect(course.github).not.toHaveProperty("grader_team");
    expect(course.github).not.toHaveProperty("grader_permission");
    expect(course.grading?.enabled).toBe(true);
    expect(course.reports.formats).toEqual(["markdown"]);
  });

  it.each(["grader_team", "grader_permission"])("rejects legacy %s in strict v2", (field) => {
    const result = parse({ ...course, github: { ...course.github, [field]: "legacy" } });
    expect(result.status).toBe("failure");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing_required_field" })
    ]);
  });

  it.each([undefined, []])("defaults omitted history to an empty array (%j)", (history) => {
    expect(
      parse({ ...course, faculty_directory: [{ ...first, github_login_history: history }] })
    ).toMatchObject({
      status: "success",
      value: { faculty_directory: [{ github_login_history: [] }] }
    });
  });

  it("allows historical logins to overlap other current logins as metadata", () => {
    expect(
      parse({
        ...course,
        faculty_directory: [{ ...first, github_login_history: [second.github_login] }, second]
      }).status
    ).toBe("success");
  });

  it.each([
    ["missing directory", { ...course, faculty_directory: undefined }],
    ["empty directory", { ...course, faculty_directory: [] }],
    ["unknown course field", { ...course, unknown: true }],
    ["v1 with directory", { ...course, schema_version: 1 }],
    ["missing version", { ...course, schema_version: undefined }],
    ["string version", { ...course, schema_version: "2" }]
  ])("rejects %s without version fallback", (_name, value) => {
    const result = parse(value);
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "missing_required_field"
    );
  });

  it.each([
    ["institutional_username", first.institutional_username],
    ["institutional_username", first.institutional_username.toUpperCase()],
    ["github_user_id", githubId],
    ["github_login", first.github_login],
    ["github_login", first.github_login.toUpperCase()]
  ])("rejects duplicate %s (%s)", (field, value) => {
    const result = parse({ ...course, faculty_directory: [first, { ...second, [field]: value }] });
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((diagnostic) => diagnostic.context?.field)).toEqual([
      `faculty_directory.1.${field}`
    ]);
  });

  it.each([
    ["institutional_username", undefined],
    ["institutional_username", ""],
    ["institutional_username", "  "],
    ["institutional_username", "jones smith"],
    ["institutional_username", "jones\u0000"],
    ["institutional_username", 1],
    ["github_user_id", undefined],
    ["github_user_id", 0],
    ["github_user_id", NEGATIVE_GITHUB_ID],
    ["github_user_id", FRACTIONAL_GITHUB_ID],
    ["github_user_id", Number.MAX_SAFE_INTEGER + 1],
    ["github_user_id", "22993125"],
    ["github_user_id", null],
    ["github_login", undefined],
    ["github_login", ""],
    ["github_login", " "],
    ["github_login", "-invalid"],
    ["github_login", "invalid--login"],
    ["github_login", "bad/login"],
    ["github_login", "a".repeat(INVALID_LOGIN_LENGTH)],
    ["github_login_history", [""]],
    ["github_login_history", "old-login"],
    ["github_login_history", null],
    ["unexpected", "field"]
  ])("rejects malformed identity %s (%j)", (field, value) => {
    expect(parse({ ...course, faculty_directory: [{ ...first, [field]: value }] }).status).toBe(
      "failure"
    );
  });

  it.each([0, 3, 4])("preserves unsupported-version diagnostics for schema %s", (version) => {
    expect(parse({ schema_version: version })).toMatchObject({
      status: "failure",
      diagnostics: [
        expect.objectContaining({
          code: "invalid_schema_version",
          context: { filePath: "course.yml", schemaVersion: version, supportedSchemaVersion: 2 }
        })
      ]
    });
  });

  it("loads v2 for model development but refuses aggregate operational loading without writing files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-v2-config-"));
    try {
      fs.cpSync("tests/fixtures/config/valid-course", root, { recursive: true });
      fs.writeFileSync(path.join(root, "course.yml"), fixture);
      const request = { cwd: root, assignmentFile: "terms/27s1/assignments/lab04/assignment.yml" };
      expect(loadCourseConfig(path.join(root, "course.yml"))).toMatchObject({
        status: "success",
        value: course
      });
      const result = loadGraiderConfig(request);
      expect(result.status).toBe("failure");
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        "invalid_schema_version"
      ]);
      expect(fs.readFileSync(path.join(root, "course.yml"), "utf8")).toBe(fixture);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("faculty identity resolution", () => {
  it("matches authenticated immutable IDs and transitional institutional usernames", () => {
    const directory = new FacultyDirectory(course);
    const record = directory.resolveByGithubUserId(githubId);
    expect(record).toEqual(first);
    expect(directory.resolveByInstitutionalUsername("JONES")).toBe(record);
    expect(directory.resolveByGithubUserId(second.github_user_id)).toEqual(second);
    expect(directory.resolveByGithubUserId(githubId + second.github_user_id)).toBeUndefined();
    expect(directory.resolveByInstitutionalUsername("unknown")).toBeUndefined();
  });

  it("keeps identity through login changes and never resolves login/history as fallback", () => {
    const renamed = {
      ...first,
      github_login: "renamed-login",
      github_login_history: [first.github_login, ...first.github_login_history]
    };
    const directory = new FacultyDirectory({ ...course, faculty_directory: [renamed, second] });
    expect(directory.resolveByGithubUserId(githubId)).toMatchObject({
      institutional_username: first.institutional_username,
      github_user_id: githubId,
      github_login: "renamed-login"
    });
    for (const login of [renamed.github_login, ...renamed.github_login_history]) {
      expect(directory.resolveByGithubUserId(Number(login))).toBeUndefined();
      expect(directory.resolveByInstitutionalUsername(login)).toBeUndefined();
    }
    expect(first.github_login).toBe("Current-Login");
    expect(Object.isFrozen(directory.resolveByGithubUserId(githubId))).toBe(true);
    expect(Object.isFrozen(directory.resolveByGithubUserId(githubId)?.github_login_history)).toBe(
      true
    );
  });
});
