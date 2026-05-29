import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadManifest } from "../../../src/manifest/manifest-loader.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/manifest");
const MANIFEST_FILE = "manifest.yml";

const manifestPath = (fixtureName: string): string =>
  path.join(FIXTURE_ROOT, fixtureName, MANIFEST_FILE);

describe("manifest loader", () => {
  it("loads a valid manifest", () => {
    const result = loadManifest(manifestPath("valid-manifest"));

    expect(result.status).toBe("loaded");
    expect(result.errors).toEqual([]);
    expect(result.manifest?.assignment).toMatchObject({
      termCode: "27s1",
      courseCode: "se2030",
      assignmentSlug: "lab04"
    });
  });

  it("load missing optional manifest returns not-found result without throwing", () => {
    const result = loadManifest(path.join(FIXTURE_ROOT, "missing", MANIFEST_FILE));

    expect(result.status).toBe("missing");
    expect(result.manifest).toBeUndefined();
    expect(result.errors).toEqual([]);
  });

  it("returns manifest_missing when a required manifest is absent", () => {
    const result = loadManifest(path.join(FIXTURE_ROOT, "missing", MANIFEST_FILE), {
      required: true
    });

    expect(result.status).toBe("failure");
    expect(result.errors).toEqual([expect.objectContaining({ code: "manifest_missing" })]);
  });

  it("returns invalid_yaml for malformed manifest YAML", () => {
    const result = loadManifest(manifestPath("malformed-yaml"));

    expect(result.status).toBe("failure");
    expect(result.errors).toEqual([expect.objectContaining({ code: "invalid_yaml" })]);
  });

  it("returns invalid_manifest_schema_version for unsupported schema version", () => {
    const result = loadManifest(manifestPath("invalid-schema-version"));

    expect(result.status).toBe("failure");
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "invalid_manifest_schema_version" })
    ]);
  });

  it("TC-CONFIG-012 invalid manifest structure fails when manifest is required", () => {
    const result = loadManifest(manifestPath("missing-section"), {
      required: true
    });

    expect(result.status).toBe("failure");
    expect(result.errors).toEqual([expect.objectContaining({ code: "missing_manifest_section" })]);
  });

  it("returns invalid_manifest_lifecycle_status for invalid lifecycle status", () => {
    const result = loadManifest(manifestPath("invalid-lifecycle-status"));

    expect(result.status).toBe("failure");
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "invalid_manifest_lifecycle_status" })
    ]);
  });

  it("returns invalid_manifest_permission for invalid permission value", () => {
    const result = loadManifest(manifestPath("invalid-permission"));

    expect(result.status).toBe("failure");
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "invalid_manifest_permission" })
    ]);
  });
});
