import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Selection } from "../../scripts/ci/selection.js";

const directories: string[] = [];
const projectRoot = process.cwd();
const selector = path.join(projectRoot, "scripts/ci/select.ts");
const tsx = path.join(projectRoot, "node_modules/tsx/dist/loader.mjs");
function fixture(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "graider-ci-"));
  directories.push(directory);
  return directory;
}
function select(directory: string, event: unknown, env: Record<string, string> = {}): Selection {
  const eventPath = path.join(directory, "event.json");
  writeFileSync(eventPath, JSON.stringify(event));
  execFileSync(process.execPath, ["--import", pathToFileURL(tsx).href, selector], {
    cwd: directory,
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/remote-course-v2",
      GITHUB_SHA: "invalid",
      CI_BASE_SHA: "",
      GITHUB_OUTPUT: path.join(directory, "outputs"),
      GITHUB_STEP_SUMMARY: path.join(directory, "summary"),
      ...env
    },
    stdio: "pipe"
  });
  return JSON.parse(readFileSync(path.join(directory, "ci-selection.json"), "utf8")) as Selection;
}
function git(directory: string, ...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=",
      "-c",
      "user.name=CI fixture",
      "-c",
      "user.email=fixture@example.invalid",
      ...args
    ],
    { cwd: directory, encoding: "utf8" }
  ).trim();
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("CI selector event and Git integration", () => {
  it("runs the required gate on native Node without dependency setup and rejects selected skips", () => {
    const directory = fixture();
    const jobs = ["root", "ui", "gui", "apply", "grading", "safety", "signing", "migration"];
    const values: Record<string, { result: string; outputs?: Record<string, string> }> =
      Object.fromEntries(["select", "fast", ...jobs].map((job) => [job, { result: "success" }]));
    values.select = {
      result: "success",
      outputs: Object.fromEntries(jobs.map((job) => [job, "true"]))
    };
    const runGate = () =>
      spawnSync(process.execPath, [path.join(projectRoot, "scripts/ci/gate.ts")], {
        cwd: directory,
        env: {
          ...process.env,
          CI_NEEDS: JSON.stringify(values),
          GITHUB_STEP_SUMMARY: path.join(directory, "gate-summary")
        },
        encoding: "utf8"
      });
    expect(runGate().status).toBe(0);
    values.migration = { result: "skipped" };
    const rejected = runGate();
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("migration: skipped");
  });
  it.each([
    [{}, { GITHUB_EVENT_NAME: "pull_request" }],
    [{ inputs: { full_regression: true } }, { GITHUB_EVENT_NAME: "workflow_dispatch" }],
    [{}, { GITHUB_REF: "refs/heads/release/1" }],
    [{}, { GITHUB_REF: "refs/heads/master" }]
  ])("always selects comprehensive acceptance for %j %j", (event, env) => {
    const result = select(fixture(), event, env);
    expect(Object.values(result.jobs)).not.toContain(false);
    expect(result.reasons[0]).toMatch(/Comprehensive/);
  });
  it("fails full when the baseline lookup or event decoding fails", () => {
    const directory = fixture();
    expect(select(directory, {}).reasons[0]).toMatch(/Change detection failed/);
    expect(
      select(directory, {}, { GITHUB_EVENT_PATH: path.join(directory, "missing") }).reasons[0]
    ).toMatch(/Change detection failed/);
  });
  it("follows transitive renderer imports and compares all unvalidated pushes", () => {
    const directory = fixture();
    git(directory, "init", "--quiet");
    const leaf = "ui/src/roster-manager/model.ts";
    const intermediate = "ui/src/roster-manager/adapter.ts";
    const migration = "ui/src/migration-review/review.ts";
    for (const [file, source] of [
      [leaf, "export const value = 1;"],
      [intermediate, 'export { value } from "./model";'],
      [migration, 'import { value } from "../roster-manager/adapter"; export const review = value;']
    ]) {
      if (!file || !source) throw new Error("Invalid fixture");
      mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      writeFileSync(path.join(directory, file), source);
    }
    git(directory, "add", "ui");
    git(directory, "commit", "--quiet", "-m", "baseline");
    const baseline = git(directory, "rev-parse", "HEAD");
    writeFileSync(path.join(directory, leaf), "export const value = 2;");
    git(directory, "add", "ui");
    git(directory, "commit", "--quiet", "-m", "unvalidated source");
    writeFileSync(path.join(directory, "README.md"), "docs followup");
    git(directory, "add", "README.md");
    git(directory, "commit", "--quiet", "-m", "later docs push");
    const head = git(directory, "rev-parse", "HEAD");
    const result = select(
      directory,
      { before: git(directory, "rev-parse", "HEAD^") },
      { GITHUB_SHA: head, CI_BASE_SHA: baseline }
    );
    expect(result.jobs.migration).toBe(true);
    expect(result.reasons).toContain(`Native migration/authority boundary: ${migration}`);
    expect(result.related).toContain(leaf);
    expect(readFileSync(path.join(directory, "outputs"), "utf8")).toContain("migration=true");
    expect(readFileSync(path.join(directory, "summary"), "utf8")).toContain(
      "Native migration/authority boundary"
    );
    mkdirSync(path.join(directory, "ui/electron"), { recursive: true });
    writeFileSync(
      path.join(directory, "ui/electron/unknown.ts"),
      'export { value } from "../src/roster-manager/model";'
    );
    git(directory, "add", "ui/electron");
    git(directory, "commit", "--quiet", "-m", "cross-boundary importer");
    const unsafe = select(
      directory,
      {},
      { GITHUB_SHA: git(directory, "rev-parse", "HEAD"), CI_BASE_SHA: baseline }
    );
    expect(Object.values(unsafe.jobs)).not.toContain(false);
  });
});
