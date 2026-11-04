import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const PACKAGE_JSON_PATH = path.resolve("package.json");
const CI_WORKFLOW_PATH = path.resolve(".github/workflows/ci.yml");
const LIVE_TEST_PATH = path.resolve("tests/live/octokit-github-client.live.test.ts");
const SOURCE_ROOT = path.resolve("src");
const PACKAGE_MANAGER_LOCK = path.resolve("package-lock.json");
const GITHUB_CLI_PATTERN = /\bgh\s/u;
const LIVE_TEST_COMMAND_PATTERN = /npm run test:live|vitest run tests\/live/u;

interface PackageJson {
  scripts?: Record<string, string>;
}

interface ValidationWorkflow {
  jobs: Record<string, { steps: { run?: string }[] }>;
}

const readPackageJson = (filename = PACKAGE_JSON_PATH): PackageJson =>
  JSON.parse(fs.readFileSync(filename, "utf8")) as PackageJson;

const readTextFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return readTextFiles(entryPath);
    }

    return entry.isFile() ? [fs.readFileSync(entryPath, "utf8")] : [];
  });

describe("CI and dependency hardening", () => {
  it("defines normal and gated-live npm scripts", () => {
    const packageJson = readPackageJson();

    expect(typeof packageJson.scripts?.build).toBe("string");
    expect(packageJson.scripts).toMatchObject({
      test: "vitest run",
      "test:watch": "vitest",
      "test:live": "vitest run tests/live",
      "build:electron-backends": "npm --prefix ui run build:template-sync",
      typecheck: "npm run build:electron-backends && npm run typecheck:prepared",
      "typecheck:prepared": "tsc --noEmit",
      lint: "eslint .",
      format: "prettier . --write",
      "format:check": "prettier . --check",
      audit: "npm audit --audit-level=high"
    });
    expect(packageJson.scripts?.check).toContain("npm run typecheck");
    expect(packageJson.scripts?.check).toContain("npm run lint");
    expect(packageJson.scripts?.check).toContain("npm run format:check");
    expect(packageJson.scripts?.check).toContain("npm test");
  });

  it("makes direct UI typechecks generate backend declarations before strict checks", () => {
    expect(readPackageJson(path.resolve("ui/package.json")).scripts).toMatchObject({
      "build:template-sync": "node scripts/build-template-sync.mjs",
      typecheck: "npm run build:template-sync && npm run typecheck:prepared",
      "typecheck:prepared":
        "tsc --noEmit --project tsconfig.json && tsc --noEmit --project tsconfig.node.json"
    });
  });

  it.each(["ci.yml", "windows-preview-build.yml"])(
    "%s generates backend declarations before prepared typechecks on a clean checkout",
    (filename) => {
      const workflow = parse(
        fs.readFileSync(path.resolve(".github/workflows", filename), "utf8")
      ) as ValidationWorkflow;
      for (const job of Object.values(workflow.jobs)) {
        const commands = job.steps.map((step) => step.run ?? "");
        const installation = commands.indexOf("npm ci --prefix ui");
        const preparation = commands.indexOf("npm run build:electron-backends");
        expect(installation).toBeGreaterThanOrEqual(0);
        expect(preparation).toBeGreaterThan(installation);
        expect(
          commands.filter((command) => command === "npm run build:electron-backends")
        ).toHaveLength(1);
        for (const command of [
          "npm run typecheck:prepared",
          "npm --prefix ui run typecheck:prepared"
        ]) {
          expect(commands.indexOf(command)).toBeGreaterThan(preparation);
        }
      }
    }
  );

  it("keeps package-lock.json available for npm ci", () => {
    expect(fs.existsSync(PACKAGE_MANAGER_LOCK)).toBe(true);
  });

  it("normal CI workflow runs required checks without live tests", () => {
    const workflow = fs.readFileSync(CI_WORKFLOW_PATH, "utf8");

    for (const command of [
      "npm ci",
      "npm run typecheck",
      "npm run lint",
      "npm run format:check",
      "npm test",
      "npm run build",
      "npm run audit"
    ]) {
      expect(workflow).toContain(command);
    }

    expect(workflow).not.toMatch(LIVE_TEST_COMMAND_PATTERN);
  });

  it("live GitHub tests are explicitly gated and skip when sandbox variables are missing", () => {
    const liveTestSource = fs.readFileSync(LIVE_TEST_PATH, "utf8");

    expect(liveTestSource).toContain("GRAIDER_RUN_LIVE_GITHUB_TESTS");
    expect(liveTestSource).toContain("GRAIDER_GITHUB_TOKEN");
    expect(liveTestSource).toContain("GRAIDER_LIVE_ORG");
    expect(liveTestSource).toContain("GRAIDER_RUN_LIVE_DESTRUCTIVE_TESTS");
    expect(liveTestSource).toContain("describe.skip");
  });

  it("normal source code does not shell out to GitHub CLI auth", () => {
    const sourceText = readTextFiles(SOURCE_ROOT).join("\n");

    expect(sourceText).not.toMatch(GITHUB_CLI_PATTERN);
  });
});
