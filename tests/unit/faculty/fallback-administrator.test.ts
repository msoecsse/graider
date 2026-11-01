import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { rawCourseConfigV2Schema } from "../../../src/config/config-schemas.js";
import { parseCourseConfig } from "../../../src/config/load-course-config.js";
import { FallbackAdministrator } from "../../../src/faculty/fallback-administrator.js";

const parsed = parseCourseConfig(
  fs.readFileSync("tests/fixtures/config/schema-v2-course.yml", "utf8"),
  "course.yml"
);
if (parsed.status !== "success" || parsed.value.schema_version !== 2) {
  throw new Error("Expected valid schema development fixture.");
}
const course = parsed.value;
const [first, second] = course.faculty_directory;
if (!first || !second) throw new Error("Expected two faculty directory members.");
const unknownId = first.github_user_id + second.github_user_id;
const NEGATIVE_GITHUB_ID = -1;
const FRACTIONAL_GITHUB_ID = 1.5;
const parseRole = (fallback: unknown) =>
  parseCourseConfig(stringify({ ...course, fallback_administrator: fallback }), "course.yml");

describe("schema v2 fallback administrator reference", () => {
  it.each([first, second])(
    "accepts one reference to existing faculty $institutional_username",
    (faculty) => {
      expect(parseRole({ github_user_id: faculty.github_user_id })).toMatchObject({
        status: "success",
        value: {
          faculty_directory: course.faculty_directory,
          fallback_administrator: { github_user_id: faculty.github_user_id }
        }
      });
    }
  );

  it.each([
    undefined,
    null,
    {},
    first.github_user_id,
    first.github_login,
    [{ github_user_id: first.github_user_id }],
    [{ github_user_id: first.github_user_id }, { github_user_id: second.github_user_id }],
    { github_user_id: first.github_user_id, github_login: first.github_login },
    { github_user_id: first.github_user_id, institutional_username: first.institutional_username }
  ])("rejects missing or malformed role %j", (role) => {
    const result = parseRole(role);
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "missing_required_field"
    ]);
  });

  it.each([
    0,
    NEGATIVE_GITHUB_ID,
    FRACTIONAL_GITHUB_ID,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    null,
    String(first.github_user_id),
    first.github_login
  ])("rejects malformed reference ID %j", (github_user_id) => {
    const result = parseRole({ github_user_id });
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((diagnostic) => diagnostic.context?.field)).toContain(
      "fallback_administrator.github_user_id"
    );
  });

  it("rejects a valid immutable ID outside the directory with a field diagnostic", () => {
    const result = parseRole({ github_user_id: unknownId });
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((diagnostic) => diagnostic.context?.field)).toEqual([
      "fallback_administrator.github_user_id"
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.context?.reason)).toEqual([
      "Fallback administrator must reference an existing faculty directory member."
    ]);
  });
});

describe("fallback administrator domain transition", () => {
  it("resolves the faculty record and matches only the referenced immutable ID", () => {
    const administrator = new FallbackAdministrator(course);
    expect(administrator.getFacultyRecord()).toEqual(first);
    expect(administrator.isFallbackAdministrator(first.github_user_id)).toBe(true);
    expect(administrator.isFallbackAdministrator(second.github_user_id)).toBe(false);
    expect(administrator.isFallbackAdministrator(unknownId)).toBe(false);
  });

  it("preserves authority across login renames without using current/history metadata", () => {
    const renamed = {
      ...first,
      github_login: "renamed-login",
      github_login_history: [first.github_login, String(second.github_user_id)]
    };
    const renamedCourse = rawCourseConfigV2Schema.parse({
      ...course,
      faculty_directory: [renamed, second]
    });
    const administrator = new FallbackAdministrator(renamedCourse);
    expect(renamedCourse.fallback_administrator).toEqual(course.fallback_administrator);
    expect(administrator.getFacultyRecord()).toEqual(renamed);
    expect(administrator.isFallbackAdministrator(first.github_user_id)).toBe(true);
    expect(administrator.isFallbackAdministrator(second.github_user_id)).toBe(false);
    for (const login of [renamed.github_login, ...renamed.github_login_history]) {
      expect(administrator.isFallbackAdministrator(Number(login))).toBe(false);
    }
  });

  it("transfers A to B, preserving every other course field and A's directory identity", () => {
    const before = structuredClone(course);
    const administrator = new FallbackAdministrator(course);
    const transferred = administrator.transferTo(second.github_user_id);
    expect(transferred).toEqual({
      ...before,
      fallback_administrator: { github_user_id: second.github_user_id }
    });
    expect(rawCourseConfigV2Schema.safeParse(transferred).success).toBe(true);
    expect(course).toEqual(before);
    expect(administrator.isFallbackAdministrator(first.github_user_id)).toBe(true);
    const successor = new FallbackAdministrator(transferred);
    expect(successor.getFacultyRecord()).toEqual(second);
    expect(successor.isFallbackAdministrator(second.github_user_id)).toBe(true);
    expect(successor.isFallbackAdministrator(first.github_user_id)).toBe(false);
    expect(transferred.faculty_directory).toContainEqual(first);
    expect(transferred.faculty_directory).toContainEqual(second);
    // A returned course is independent of both the original and the model's snapshot.
    transferred.faculty_directory[0]?.github_login_history.push("later-metadata");
    expect(course).toEqual(before);
    expect(administrator.transferTo(second.github_user_id).faculty_directory).toEqual(
      before.faculty_directory
    );
  });

  it("refuses transfer outside the directory without changing the current administrator", () => {
    const administrator = new FallbackAdministrator(course);
    expect(() => administrator.transferTo(unknownId)).toThrow(
      "requires an existing faculty directory member"
    );
    expect(administrator.isFallbackAdministrator(first.github_user_id)).toBe(true);
    expect(course.fallback_administrator.github_user_id).toBe(first.github_user_id);
  });

  it("takes a validated snapshot so later caller mutations cannot alter its identity", () => {
    const input = structuredClone(course);
    const administrator = new FallbackAdministrator(input);
    input.fallback_administrator.github_user_id = second.github_user_id;
    expect(administrator.isFallbackAdministrator(first.github_user_id)).toBe(true);
    expect(
      () =>
        new FallbackAdministrator({
          ...course,
          fallback_administrator: { github_user_id: unknownId }
        })
    ).toThrow();
  });
});
