import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { loadTermConfig, parseTermConfig } from "../../../src/config/load-term-config.js";

const parsed = loadTermConfig("tests/fixtures/config/schema-v2-term.yml");
if (parsed.status !== "success" || parsed.value.schema_version !== 2)
  throw new Error("Invalid v2 term fixture.");
const term = parsed.value;
const [a, b] = term.coordinators.current;
if (!a || !b) throw new Error("Expected two faculty references.");
const c = { github_user_id: b.github_user_id + 1 };
const d = { github_user_id: c.github_user_id + 1 };
const parseFaculty = (faculty: unknown) =>
  parseTermConfig(stringify({ ...term, sections: [{ id: "001", faculty }] }), "term.yml");
const NEGATIVE_ID = -1;
const FRACTIONAL_ID = 1.5;

describe("v2 section faculty history schema", () => {
  it("accepts multiple current and former identities and preserves section metadata", () => {
    expect(parseFaculty({ current: [a, b], former: [c, d] })).toMatchObject({
      status: "success",
      value: { sections: [{ id: "001", faculty: { current: [a, b], former: [c, d] } }] }
    });
    expect(parseFaculty({ current: [], former: [] }).status).toBe("success");
    expect(parseFaculty({ current: [], former: [a] }).status).toBe("success");
  });

  it.each([
    { current: [a, a], former: [] },
    { current: [], former: [b, b] },
    { current: [a], former: [a] }
  ])("rejects duplicate or overlapping IDs within a section %j", (faculty) => {
    const result = parseFaculty(faculty);
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((diagnostic) => diagnostic.context?.field)).toEqual([
      faculty.current.length > 1
        ? "sections.0.faculty.current.1.github_user_id"
        : faculty.former.length > 1
          ? "sections.0.faculty.former.1.github_user_id"
          : "sections.0.faculty.former.0.github_user_id"
    ]);
  });

  for (const role of ["current", "former"] as const) {
    it.each([
      0,
      NEGATIVE_ID,
      FRACTIONAL_ID,
      Number.MAX_SAFE_INTEGER + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "22993125",
      undefined,
      null
    ])(`rejects malformed ${role} ID %j`, (github_user_id) => {
      const result = parseFaculty({ current: [], former: [], [role]: [{ github_user_id }] });
      expect(result.status).toBe("failure");
      expect(result.diagnostics.map((diagnostic) => diagnostic.context?.field)).toContain(
        `sections.0.faculty.${role}.0.github_user_id`
      );
    });
  }

  it.each([
    undefined,
    null,
    {},
    [],
    ["jones", "smith"],
    { current: [] },
    { former: [] },
    { current: [], former: [], unexpected: true },
    { current: [{ ...a, institutional_username: "jones" }], former: [] },
    { current: [], former: [{ ...b, github_login: "smith-login" }] },
    { current: [a.github_user_id], former: [] },
    { current: [], former: ["smith"] }
  ])("requires strict current/former reference lists, rejecting legacy usernames %j", (faculty) => {
    expect(parseFaculty(faculty).status).toBe("failure");
  });

  it("keeps v1 username arrays valid without interpreting them as history", () => {
    const result = parseTermConfig(
      stringify({
        schema_version: 1,
        term: term.term,
        sections: [{ id: "001", faculty: ["jones", "smith"] }]
      }),
      "term.yml"
    );
    expect(result).toMatchObject({
      status: "success",
      value: { schema_version: 1, sections: [{ id: "001", faculty: ["jones", "smith"] }] }
    });
    expect(
      parseTermConfig(
        stringify({
          schema_version: 1,
          term: term.term,
          sections: [{ id: "001", faculty: { current: [a], former: [] } }]
        }),
        "term.yml"
      ).status
    ).toBe("failure");
  });
});
