import { describe, expect, it } from "vitest";
import type { Manifest } from "../../../src/manifest/manifest-models.js";
import {
  findStudentRepositoryMapping,
  normalizeManifestRepositories
} from "../../../src/manifest/repository-targets.js";

const manifest = {
  repositories: [
    {
      studentId: "ada",
      githubUsername: "ada",
      section: "001",
      rosterStatus: "active",
      repository: { name: "27s1-csc-hw1-ada", htmlUrl: "https://example.test/ada" },
      warnings: [],
      errors: []
    }
  ]
} as unknown as Manifest;

describe("repository target manifest compatibility", () => {
  it("normalizes a legacy per-student repository record into one individual target and mapping", () => {
    const normalized = normalizeManifestRepositories(manifest);
    expect(normalized.targets).toMatchObject([
      { targetId: "ada", mode: "individual", studentIds: ["ada"], githubUsernames: ["ada"] }
    ]);
    expect(findStudentRepositoryMapping(normalized, "ada")).toMatchObject({
      repositoryName: "27s1-csc-hw1-ada"
    });
    expect(findStudentRepositoryMapping(normalized, "missing")).toBeUndefined();
  });
});
