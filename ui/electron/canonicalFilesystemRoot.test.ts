// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalFilesystemRoot, sameFilesystemRoot } from "./canonicalFilesystemRoot.js";

const roots: string[] = [];
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-native-root-"));
  roots.push(root);
  const repo = path.join(root, "repo");
  const nested = path.join(repo, "nested");
  const sibling = path.join(root, "sibling");
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(sibling);
  return { root, repo, nested, sibling };
};
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
describe("native filesystem root identity", () => {
  it("matches the native async canonicalization used by the Git workspace factory", async () => {
    const f = fixture();
    expect(canonicalFilesystemRoot(f.repo)).toBe(await fs.promises.realpath(f.repo));
  });
  it("accepts an alternate spelling of the exact root despite legacy realpath aliases", async () => {
    const f = fixture();
    const alias = path.join(f.root, "alias");
    fs.symlinkSync(f.repo, alias, "dir");
    const workspaceRoot = await fs.promises.realpath(f.repo);
    const legacy = vi
      .spyOn(fs, "realpathSync")
      .mockImplementation((value) => (value === alias ? alias : workspaceRoot));
    try {
      expect(fs.realpathSync(alias)).not.toBe(fs.realpathSync(workspaceRoot));
      expect(sameFilesystemRoot(workspaceRoot, alias)).toBe(true);
      expect(sameFilesystemRoot(workspaceRoot, f.nested)).toBe(false);
    } finally {
      legacy.mockRestore();
    }
  });
  it("rejects nested and sibling roots, including links to those roots", () => {
    const f = fixture();
    const alias = path.join(f.root, "nested-alias");
    fs.symlinkSync(f.nested, alias, "dir");
    expect(sameFilesystemRoot(f.repo, f.nested)).toBe(false);
    expect(sameFilesystemRoot(f.repo, f.sibling)).toBe(false);
    expect(sameFilesystemRoot(f.repo, alias)).toBe(false);
  });
  it("fails closed when a requested root does not exist", () => {
    const f = fixture();
    expect(() => sameFilesystemRoot(f.repo, path.join(f.root, "missing"))).toThrow();
  });
});
