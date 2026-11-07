// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMetadata } from "./remoteCourseDiscovery.js";

const v1 = fs.readFileSync("../tests/fixtures/config/valid-course/course.yml", "utf8");
const v2 = fs.readFileSync("../tests/fixtures/config/schema-v2-course.yml", "utf8");

describe("production course schema activation boundary", () => {
  it.each([2, 3])("refuses term schema %s even with operational v1 course metadata", (version) => {
    const content = fs
      .readFileSync("../tests/fixtures/config/schema-v2-term.yml", "utf8")
      .replace("schema_version: 2", `schema_version: ${version}`);
    const metadata = loadMetadata();
    expect(metadata.inspectTermFaculty(content, "27s1", "jones")).toBe("invalid_metadata");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-term-schema-gate-"));
    try {
      fs.writeFileSync(path.join(root, "course.yml"), v1);
      fs.mkdirSync(path.join(root, "terms/27s1"), { recursive: true });
      fs.writeFileSync(path.join(root, "terms/27s1/term.yml"), content);
      expect(() => metadata.validateTransaction(root, "example-org")).toThrow(
        "Invalid term metadata."
      );
      expect(fs.readFileSync(path.join(root, "terms/27s1/term.yml"), "utf8")).toBe(content);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps v1 inspection operational", () => {
    expect(loadMetadata().inspectCourse(v1)).toMatchObject({ status: "valid", schemaVersion: 1 });
  });

  it.each([v2, v2.replace("schema_version: 2", "schema_version: 3")])(
    "refuses newer schemas in inspection and mutation validation",
    (content) => {
      const metadata = loadMetadata();
      expect(metadata.inspectCourse(content)).toEqual({
        status: content.includes("schema_version: 3") ? "unsupported_schema" : "invalid_metadata"
      });
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-schema-gate-"));
      try {
        fs.writeFileSync(path.join(root, "course.yml"), content);
        expect(() => metadata.validateTransaction(root, "example-org")).toThrow(
          "Invalid course metadata or organization binding."
        );
        expect(fs.readFileSync(path.join(root, "course.yml"), "utf8")).toBe(content);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  );
});
