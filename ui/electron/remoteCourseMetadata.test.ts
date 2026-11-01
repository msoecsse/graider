// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMetadata } from "./remoteCourseDiscovery.js";

const v1 = fs.readFileSync("../tests/fixtures/config/valid-course/course.yml", "utf8");
const v2 = fs.readFileSync("../tests/fixtures/config/schema-v2-course.yml", "utf8");

describe("production course schema activation boundary", () => {
  it("keeps v1 inspection operational", () => {
    expect(loadMetadata().inspectCourse(v1)).toMatchObject({ status: "valid", schemaVersion: 1 });
  });

  it.each([v2, v2.replace("schema_version: 2", "schema_version: 3")])(
    "refuses newer schemas in inspection and mutation validation",
    (content) => {
      const metadata = loadMetadata();
      expect(metadata.inspectCourse(content)).toEqual({ status: "unsupported_schema" });
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
