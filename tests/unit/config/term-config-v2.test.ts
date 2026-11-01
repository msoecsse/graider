import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { loadTermConfig, parseTermConfig } from "../../../src/config/load-term-config.js";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import {
  rawTermConfigSchema,
  rawTermConfigV1Schema,
  rawTermConfigV2Schema
} from "../../../src/config/config-schemas.js";

const v1File = "tests/fixtures/config/valid-course/terms/27s1/term.yml";
const v2File = "tests/fixtures/config/schema-v2-term.yml";
const parsed = loadTermConfig(v2File);
if (parsed.status !== "success" || parsed.value.schema_version !== 2)
  throw new Error("Invalid term development fixture.");
const term = parsed.value;
const [first, second] = term.coordinators.current;
if (!first || !second) throw new Error("Expected multiple current coordinators.");
const parse = (value: unknown) => parseTermConfig(stringify(value), "term.yml");
const NEGATIVE_ID = -1;
const FRACTIONAL_ID = 1.5;

describe("versioned term parsing", () => {
  it("preserves the v1 fixture without coordinator inference", () => {
    const result = loadTermConfig(v1File);
    expect(result).toMatchObject({
      status: "success",
      value: {
        schema_version: 1,
        term: term.term,
        sections: term.sections.map(({ id, roster }) => ({ id, roster }))
      }
    });
    if (result.status === "success") {
      expect(result.value).toStrictEqual(rawTermConfigV1Schema.parse(result.value));
      expect(result.value).not.toHaveProperty("coordinators");
    }
  });

  it("parses multiple current coordinators and former history with v2 sections", () => {
    const value = { ...term, coordinators: { current: [first], former: [second] } };
    expect(parse(term)).toMatchObject({ status: "success", value: term });
    expect(parse(value)).toMatchObject({ status: "success", value });
    expect(rawTermConfigSchema.parse(value)).toEqual(rawTermConfigV2Schema.parse(value));
    expect(
      parse({
        ...term,
        sections: [{ ...term.sections[0], faculty: { current: [first, second], former: [] } }]
      }).status
    ).toBe("success");
  });

  it("allows empty current/former lists structurally without imposing lifecycle assumptions", () => {
    expect(parse({ ...term, coordinators: { current: [], former: [] } }).status).toBe("success");
  });

  it.each([
    { current: [first, first], former: [] },
    { current: [first], former: [second, second] },
    { current: [first], former: [first] }
  ])("rejects duplicate and overlapping role IDs %j", (coordinators) => {
    const result = parse({ ...term, coordinators });
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "missing_required_field"
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
      null,
      undefined
    ])(`rejects invalid ${role} reference ID %j`, (github_user_id) => {
      const result = parse({
        ...term,
        coordinators: { current: [], former: [], [role]: [{ github_user_id }] }
      });
      expect(result.status).toBe("failure");
      expect(result.diagnostics.map((diagnostic) => diagnostic.context?.field)).toContain(
        `coordinators.${role}.0.github_user_id`
      );
    });
  }

  it.each([
    undefined,
    null,
    [],
    {},
    { current: [] },
    { former: [] },
    { current: [], former: [], unexpected: [] },
    { current: [{ ...first, github_login: "login" }], former: [] },
    { current: [], former: [{ ...second, institutional_username: "smith" }] },
    { current: [first.github_user_id], former: [] }
  ])("rejects missing, malformed or additional coordinator fields %j", (coordinators) => {
    expect(parse({ ...term, coordinators }).status).toBe("failure");
  });

  it.each([
    { ...term, unknown: true },
    { ...term, term: { ...term.term, unknown: true } },
    { ...term, sections: [{ ...term.sections[0], unknown: true }] },
    { ...term, schema_version: 1 },
    { ...term, schema_version: "2" },
    { ...term, schema_version: undefined }
  ])("retains strict versioned shapes without falling back to v1", (value) => {
    expect(parse(value).status).toBe("failure");
  });

  it.each([0, 3, 4])("rejects unsupported schema %s with version diagnostics", (schema_version) => {
    const result = parse({ schema_version });
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "invalid_schema_version"
    ]);
  });

  it.each([1, 2])(
    "blocks v2 terms in aggregate operations even with course schema %s",
    (courseVersion) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-v2-term-gate-"));
      try {
        fs.cpSync("tests/fixtures/config/valid-course", root, { recursive: true });
        const termPath = path.join(root, "terms/27s1/term.yml");
        const content = fs.readFileSync(v2File, "utf8");
        fs.writeFileSync(termPath, content);
        if (courseVersion === 2)
          fs.copyFileSync(
            "tests/fixtures/config/schema-v2-course.yml",
            path.join(root, "course.yml")
          );
        const result = loadGraiderConfig({
          cwd: root,
          assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
        });
        expect(result.status).toBe("failure");
        expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
          Array<string>(courseVersion).fill("invalid_schema_version")
        );
        expect(fs.readFileSync(termPath, "utf8")).toBe(content);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  );
});
