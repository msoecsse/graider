import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { loadManifest } from "../../../src/manifest/manifest-loader.js";
import { createManifestPath } from "../../../src/manifest/manifest-paths.js";
import { renderManifestYaml, writeManifest } from "../../../src/manifest/manifest-renderer.js";
import { createEmptyManifest } from "../../../src/manifest/manifest-updater.js";

const CREATED_AT = "2026-09-01T14:30:00.000Z";
const SOURCE_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const INPUT_FINGERPRINT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const createManifest = () =>
  createEmptyManifest({
    assignment: {
      termCode: "27s1",
      courseCode: "se2030",
      assignmentSlug: "lab04",
      assignmentTitle: "Lab 04"
    },
    source: {
      sourceFiles: [
        {
          path: "course.yml",
          sha256: SOURCE_HASH
        }
      ],
      inputFingerprint: INPUT_FINGERPRINT
    },
    template: {
      repository: "example-org/lab04-template",
      branch: "main",
      commitSha: "template-sha"
    }
  });

describe("manifest renderer", () => {
  it("manifest path helper returns expected absolute and repo-relative paths", () => {
    const repoRoot = path.resolve("tests/fixtures/manifest");
    const result = createManifestPath(repoRoot, "27s1", "lab04");

    expect(result.relativePath).toBe("terms/27s1/manifests/lab04/manifest.yml");
    expect(result.absolutePath).toBe(path.join(repoRoot, result.relativePath));
  });

  it("TC-MANIFEST-001 manifest includes required sections", () => {
    const yaml = renderManifestYaml(createManifest());
    const raw = parse(yaml) as Record<string, unknown>;

    expect(Object.keys(raw)).toEqual([
      "schema_version",
      "assignment",
      "source",
      "template",
      "repositories",
      "operation_history",
      "warnings",
      "errors"
    ]);
  });

  it("TC-MANIFEST-002 manifest includes source file hashes", () => {
    const raw = parse(renderManifestYaml(createManifest())) as {
      source: { source_files: Array<{ path: string; sha256: string }> };
    };

    expect(raw.source.source_files).toEqual([
      {
        path: "course.yml",
        sha256: SOURCE_HASH
      }
    ]);
  });

  it("TC-MANIFEST-003 manifest includes input fingerprint", () => {
    const raw = parse(renderManifestYaml(createManifest())) as {
      source: { input_fingerprint: string };
    };

    expect(raw.source.input_fingerprint).toBe(INPUT_FINGERPRINT);
  });

  it("TC-MANIFEST-004 manifest renders deterministically", () => {
    const manifest = createManifest();

    expect(renderManifestYaml(manifest)).toBe(renderManifestYaml(manifest));
  });

  it("rendered YAML uses snake_case fields", () => {
    const yaml = renderManifestYaml(createManifest());

    expect(yaml).toContain("schema_version:");
    expect(yaml).toContain("input_fingerprint:");
    expect(yaml).not.toContain("schemaVersion");
    expect(yaml).not.toContain("inputFingerprint");
  });

  it("rendered YAML excludes absolute source paths", () => {
    const yaml = renderManifestYaml(createManifest());

    expect(yaml).not.toContain(path.resolve("course.yml"));
  });

  it("write helper creates parent directory and writes parseable YAML", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-manifest-"));
    const manifestPath = createManifestPath(repoRoot, "27s1", "lab04");
    const writeResult = writeManifest(manifestPath.absolutePath, createManifest());

    expect(writeResult.status).toBe("success");
    expect(loadManifest(manifestPath.absolutePath).status).toBe("loaded");
  });

  it("loaded valid fixture renders deterministically after normalization", () => {
    const loadResult = loadManifest(
      path.resolve("tests/fixtures/manifest/valid-manifest/manifest.yml")
    );

    if (loadResult.status !== "loaded") {
      throw new Error("Fixture manifest must load.");
    }

    expect(renderManifestYaml(loadResult.manifest)).toBe(renderManifestYaml(loadResult.manifest));
    expect(renderManifestYaml(loadResult.manifest)).toContain(`created_at: ${CREATED_AT}`);
  });

  it("round-trips repository template-sync anchors without changing their values", () => {
    const manifest = createManifest();
    manifest.repositories.push({
      studentId: "jones",
      githubUsername: "seanjones",
      section: "001",
      rosterStatus: "active",
      repository: {
        owner: "example-org",
        name: "lab04-seanjones",
        fullName: "example-org/lab04-seanjones",
        createdFromTemplate: true,
        templateRepository: "example-org/lab04-template",
        templateCommitSha: "template-sync-sha",
        studentDefaultBranchCommitSha: "student-sync-sha"
      },
      permissions: {},
      actions: { enabled: false },
      lifecycle: { repositoryArchived: false, studentAccessRemoved: false, status: "created" },
      warnings: [],
      errors: []
    });

    const yaml = renderManifestYaml(manifest);
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-manifest-sync-"));
    const manifestPath = createManifestPath(repoRoot, "27s1", "lab04");
    fs.mkdirSync(path.dirname(manifestPath.absolutePath), { recursive: true });
    fs.writeFileSync(manifestPath.absolutePath, yaml, "utf8");
    const loaded = loadManifest(manifestPath.absolutePath);

    expect(yaml).toContain("student_default_branch_commit_sha: student-sync-sha");
    expect(loaded.status).toBe("loaded");
    if (loaded.status === "loaded") {
      expect(loaded.manifest.repositories[0]?.repository).toMatchObject({
        templateCommitSha: "template-sync-sha",
        studentDefaultBranchCommitSha: "student-sync-sha",
        templateSyncBaselineStatus: "initialized"
      });
      expect(renderManifestYaml(loaded.manifest)).toBe(yaml);
    }
  });

  it("loads legacy repository state without a template-sync baseline", () => {
    const result = loadManifest(path.resolve("tests/fixtures/manifest/valid-manifest/manifest.yml"));

    expect(result.status).toBe("loaded");
    if (result.status === "loaded") {
      expect(result.manifest.repositories[0]?.repository.studentDefaultBranchCommitSha).toBeUndefined();
      expect(result.manifest.repositories[0]?.repository.templateSyncBaselineStatus).toBe(
        "baseline_required"
      );
    }
  });
});
