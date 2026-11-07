import { describe, expect, it } from "vitest";
import {
  migrationRetryArtifactSchema,
  matchesMigrationRetryBinding
} from "../../../src/migration/migration-retry-state.js";
const CHANGED_ID = 999;
const SHA_LENGTH = 40;
const DIGEST_LENGTH = 64;
const source = "a".repeat(SHA_LENGTH);
const binding = {
  authenticatedGithubUserId: 101,
  repositoryId: 700,
  organizationId: 800,
  sourceCommitSha: source,
  reportId: "b".repeat(DIGEST_LENGTH),
  reviewId: "c".repeat(DIGEST_LENGTH),
  candidateFingerprint: "d".repeat(DIGEST_LENGTH),
  checkpointReference: `refs/tags/graider-migration-v1/${source}`,
  checkpointCommit: source
};
const artifact = {
  kind: "migration-prepublication-retry",
  version: 1,
  binding,
  failure: "prepublication_failed"
};
describe("non-authoritative migration retry record", () => {
  it("accepts exactly the bound prepublication hint", () => {
    expect(migrationRetryArtifactSchema.parse(artifact)).toEqual(artifact);
    expect(matchesMigrationRetryBinding(artifact, binding)).toBe(true);
  });
  it.each(Object.keys(binding) as (keyof typeof binding)[])("invalidates changed %s", (key) => {
    const changed = {
      ...binding,
      [key]: typeof binding[key] === "number" ? CHANGED_ID : "e".repeat(DIGEST_LENGTH)
    };
    expect(matchesMigrationRetryBinding(artifact, changed)).toBe(false);
  });
  it.each(["token", "authorization", "path", "publish", "authorized", "publicationReady"])(
    "rejects extra %s authority and secrets",
    (key) => {
      expect(
        migrationRetryArtifactSchema.safeParse({ ...artifact, [key]: "fake-secret" }).success
      ).toBe(false);
      expect(
        migrationRetryArtifactSchema.safeParse({
          ...artifact,
          binding: { ...binding, [key]: "fake-secret" }
        }).success
      ).toBe(false);
    }
  );
  it.each([
    { binding: { ...binding, sourceCommitSha: "HEAD" } },
    { version: 2 },
    { failure: "Authorization: fake-secret" },
    { binding: { ...binding, checkpointCommit: "f".repeat(SHA_LENGTH) } },
    { binding: { ...binding, checkpointReference: "refs/tags/arbitrary" } },
    { binding: { ...binding, authenticatedGithubUserId: -1 } },
    { binding: { ...binding, reviewId: "../../outside" } }
  ])("rejects malformed record %j", (change) => {
    expect(migrationRetryArtifactSchema.safeParse({ ...artifact, ...change }).success).toBe(false);
  });
});
