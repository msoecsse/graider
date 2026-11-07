import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMigrationRetryStore } from "./migrationRetryStore.js";
const USER = 101;
const REPO = 700;
const ORG = 800;
const SHA_LENGTH = 40;
const DIGEST_LENGTH = 64;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider retry store "));
  roots.push(root);
  const source = "a".repeat(SHA_LENGTH);
  const record = {
    kind: "migration-prepublication-retry" as const,
    version: 1 as const,
    binding: {
      authenticatedGithubUserId: USER,
      repositoryId: REPO,
      organizationId: ORG,
      sourceCommitSha: source,
      reportId: "b".repeat(DIGEST_LENGTH),
      reviewId: "c".repeat(DIGEST_LENGTH),
      candidateFingerprint: "d".repeat(DIGEST_LENGTH),
      checkpointReference: `refs/tags/graider-migration-v1/${source}`,
      checkpointCommit: source
    },
    failure: "prepublication_failed" as const
  };
  const store = createMigrationRetryStore(root);
  const directory = path.join(root, "managed-courses", String(USER), String(REPO));
  return { root, record, store, directory, file: path.join(directory, "migration-retry.json") };
};
describe("main-owned fixed-location migration retry store", () => {
  it("does not seed storage on reads and roundtrips an exact record outside the worktree", () => {
    const f = setup();
    expect(f.store.read(USER, REPO)).toBeNull();
    expect(fs.readdirSync(f.root)).toEqual([]);
    f.store.write(f.record);
    expect(f.store.read(USER, REPO)).toEqual(f.record);
    expect(fs.existsSync(path.join(f.directory, "repo"))).toBe(false);
    expect(fs.readdirSync(f.directory)).toEqual(["migration-retry.json"]);
  });
  it("rejects unknown secret/path/capability fields before any writes", () => {
    const f = setup();
    for (const extra of [
      { token: "fake-secret" },
      { path: "../outside" },
      { authorized: true },
      { publish: () => {} }
    ])
      expect(() => f.store.write({ ...f.record, ...extra })).toThrow(
        "Invalid migration retry record"
      );
    expect(fs.readdirSync(f.root)).toEqual([]);
  });
  it("rejects malformed, foreign and oversized disk records", () => {
    const f = setup();
    f.store.write(f.record);
    for (const contents of [
      "{broken",
      JSON.stringify({
        ...f.record,
        binding: { ...f.record.binding, authenticatedGithubUserId: USER + 1 }
      }),
      JSON.stringify({ ...f.record, authorization: "fake-secret" }),
      "x".repeat(32 * 1024)
    ]) {
      fs.writeFileSync(f.file, contents);
      expect(f.store.read(USER, REPO)).toBeNull();
    }
  });
  it("rejects path-like identity inputs", () => {
    const f = setup();
    expect(() => f.store.read("../outside" as never, REPO)).toThrow();
    expect(() => f.store.read(USER, -1)).toThrow();
  });
  it("refuses file links and directory junctions without changing their targets", () => {
    const f = setup();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "graider retry outside "));
    roots.push(outside);
    const target = path.join(outside, "important.json");
    fs.writeFileSync(target, "preserve");
    fs.mkdirSync(f.directory, { recursive: true });
    fs.linkSync(target, f.file);
    expect(f.store.read(USER, REPO)).toBeNull();
    expect(() => f.store.write(f.record)).toThrow();
    expect(fs.readFileSync(target, "utf8")).toBe("preserve");
    fs.unlinkSync(f.file);
    fs.rmdirSync(f.directory);
    fs.symlinkSync(outside, f.directory, process.platform === "win32" ? "junction" : "dir");
    expect(() => f.store.read(USER, REPO)).toThrow();
    expect(() => f.store.write(f.record)).toThrow();
    expect(fs.readdirSync(outside)).toEqual(["important.json"]);
  });
});
