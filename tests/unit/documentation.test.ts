import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import { validateGradingResultsJson } from "../../src/grading/grading-result-validator.js";

const README_PATH = path.resolve("README.md");
const PACKAGE_JSON_PATH = path.resolve("package.json");
const ERROR_CATALOG_PATH = path.resolve("docs/error-warning-catalog.md");
const EXAMPLES_ROOT = path.resolve("docs/examples");
const EXPECTED_BIN_PATH = "./dist/index.js";
const MINIMUM_EXAMPLE_COUNT = 1;

interface PackageJson {
  bin?: Record<string, string>;
  files?: string[];
  packageManager?: string;
}

const readJson = (filePath: string): unknown =>
  JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;

const readPackageJson = (): PackageJson => readJson(PACKAGE_JSON_PATH) as PackageJson;

describe("documentation and release readiness", () => {
  it("README documents unsupported archive and remove-access MVP shells", () => {
    const readme = fs.readFileSync(README_PATH, "utf8");

    expect(readme).toContain("archive");
    expect(readme).toContain("remove-access");
    expect(readme).toContain("Reserved command shell; not supported in MVP.");
    expect(readme).toContain("not_supported_in_mvp");
  });

  it("package metadata points the graider bin at the built CLI entry", () => {
    const packageJson = readPackageJson();

    expect(packageJson.bin?.graider).toBe(EXPECTED_BIN_PATH);
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "README.md", "docs"]));
    expect(packageJson.packageManager?.startsWith("npm@")).toBe(true);
  });

  it("docs example JSON parses and validates as a grading result", () => {
    const parsed = readJson(path.join(EXAMPLES_ROOT, "grading-results.json"));
    const result = validateGradingResultsJson(parsed);

    expect(result.errors).toEqual([]);
    expect(result.result?.status).toBe("passed");
  });

  it("docs example YAML files parse", () => {
    const yamlFiles = ["course.yml", "term.yml", "assignment.yml", "workflow.yml"];

    for (const fileName of yamlFiles) {
      const parsed: unknown = parseYaml(
        fs.readFileSync(path.join(EXAMPLES_ROOT, fileName), "utf8")
      );

      expect(parsed, fileName).toBeDefined();
    }
  });

  it("docs example roster has the required CSV header", () => {
    const roster = fs.readFileSync(path.join(EXAMPLES_ROOT, "section-001.csv"), "utf8");

    expect(roster.split("\n")[0]).toBe("student_id,github_username,section,status");
  });

  it("documents every central diagnostic code in the error catalog", () => {
    const catalog = fs.readFileSync(ERROR_CATALOG_PATH, "utf8");
    const diagnosticCodes = Object.values(DiagnosticCode);

    expect(diagnosticCodes.length).toBeGreaterThan(MINIMUM_EXAMPLE_COUNT);

    for (const code of diagnosticCodes) {
      expect(catalog).toContain(`\`${code}\``);
    }
  });
});
