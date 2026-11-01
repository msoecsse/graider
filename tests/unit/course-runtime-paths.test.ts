import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerCourseRuntimeRoot,
  courseRuntimePath
} from "../../src/core/course-runtime-paths.js";
import { createManifestPath } from "../../src/manifest/manifest-paths.js";
import { createReportPaths } from "../../src/reporting/report-paths.js";
import { createGradingStatePath } from "../../src/grading/grading-state.js";

const roots: string[] = [];
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-course-runtime-"));
  roots.push(root);
  const source = path.join(root, "source"),
    runtime = path.join(root, "runtime");
  fs.mkdirSync(source);
  fs.mkdirSync(runtime);
  return { source, runtime };
};
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
describe("managed course generated-artifact storage", () => {
  it("preserves legacy paths until a trusted managed registration exists", () => {
    const f = fixture();
    expect(createManifestPath(f.source, "27s1", "lab01").absolutePath).toBe(
      path.join(f.source, "terms/27s1/manifests/lab01/manifest.yml")
    );
    expect(
      createGradingStatePath({
        courseRoot: f.source,
        termCode: "27s1",
        assignmentSlug: "lab01",
        studentId: "s1"
      })
    ).toMatchObject({ value: path.join(f.source, ".graider/grading/27s1/lab01/state/s1.json") });
  });
  it("separates generated manifests, reports, and grading state from authoritative configuration", () => {
    const f = fixture();
    registerCourseRuntimeRoot(f.source, f.runtime);
    expect(createManifestPath(f.source, "27s1", "lab01").absolutePath).toBe(
      path.join(f.runtime, "terms/27s1/manifests/lab01/manifest.yml")
    );
    expect(createReportPaths(f.source, "27s1", "lab01").facultyJson.absolutePath).toBe(
      path.join(f.runtime, "terms/27s1/reports/lab01/faculty-summary.json")
    );
    expect(
      createGradingStatePath({
        courseRoot: f.source,
        termCode: "27s1",
        assignmentSlug: "lab01",
        studentId: "s1"
      })
    ).toMatchObject({ value: path.join(f.runtime, ".graider/grading/27s1/lab01/state/s1.json") });
  });
  it("seeds authoritative generated artifacts once, then preserves local operation history", () => {
    const f = fixture(),
      relative = "terms/27s1/manifests/lab01/manifest.yml";
    fs.mkdirSync(path.dirname(path.join(f.source, relative)), { recursive: true });
    fs.writeFileSync(path.join(f.source, relative), "authoritative baseline");
    registerCourseRuntimeRoot(f.source, f.runtime);
    const file = courseRuntimePath(f.source, relative);
    expect(fs.readFileSync(file, "utf8")).toBe("authoritative baseline");
    fs.writeFileSync(file, "new local history");
    expect(courseRuntimePath(f.source, relative)).toBe(file);
    expect(fs.readFileSync(file, "utf8")).toBe("new local history");
    expect(fs.readFileSync(path.join(f.source, relative), "utf8")).toBe("authoritative baseline");
  });
  it("passes a trusted source/runtime pair to the CLI without changing other course roots", () => {
    const f = fixture();
    vi.stubEnv("GRAIDER_MANAGED_COURSE_SOURCE", f.source);
    vi.stubEnv("GRAIDER_MANAGED_COURSE_RUNTIME", f.runtime);
    expect(createManifestPath(f.source, "27s1", "lab01").absolutePath.startsWith(f.runtime)).toBe(
      true
    );
    const other = fixture();
    expect(
      createManifestPath(other.source, "27s1", "lab01").absolutePath.startsWith(other.source)
    ).toBe(true);
  });
  it("rejects traversal, links, and runtime storage inside the configuration repository", () => {
    const f = fixture();
    expect(() => {
      registerCourseRuntimeRoot(f.source, path.join(f.source, "runtime"));
    }).toThrow();
    registerCourseRuntimeRoot(f.source, f.runtime);
    expect(() => courseRuntimePath(f.source, "../course.yml")).toThrow();
    fs.symlinkSync(f.source, path.join(f.runtime, "link"));
    expect(() => courseRuntimePath(f.source, "link/course.yml")).toThrow();
  });
});
