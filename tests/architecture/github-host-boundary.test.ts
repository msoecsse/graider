import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADAPTER = "src/github/octokit-github-client.ts";
const FACTORY = "src/github/github-client-factory.ts";
const COMPOSITION = "src/github/github-client-composition.ts";
const FEATURE = "src/grading/example.ts";
const PRODUCTION_SOURCE_ROOTS = ["src", "ui/electron"] as const;

const readProductionTypeScriptFiles = (directory: string): readonly string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return readProductionTypeScriptFiles(entryPath);
    }
    return entry.isFile() &&
      /\.tsx?$/u.test(entry.name) &&
      !/\.(?:test|spec)\.tsx?$/u.test(entry.name)
      ? [entryPath]
      : [];
  });

const findBoundaryViolations = (sourcePath: string, source: string): readonly string[] => {
  const violations = new Set<string>();
  const concreteAllowed = sourcePath === ADAPTER || sourcePath === FACTORY;
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
  const restSignals = {
    hasApiRoot: false,
    hasApiVersionHeader: false,
    hasBearerHeader: false,
    hasTransportCall: false
  };
  const visit = (node: ts.Node): void => {
    const literalText = ts.isStringLiteralLike(node)
      ? node.text
      : ts.isTemplateExpression(node)
        ? node.head.text
        : "";
    if (/^https:\/\/api\.github\.com(?:\/|$)/u.test(literalText)) {
      restSignals.hasApiRoot = true;
    }
    if (ts.isPropertyAssignment(node)) {
      const header =
        ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)
          ? node.name.text.toLowerCase()
          : "";
      if (header === "x-github-api-version") restSignals.hasApiVersionHeader = true;
      if (
        header === "authorization" &&
        /^`?Bearer\s/u.test(node.initializer.getText(file).replace(/^["']/u, ""))
      ) {
        restSignals.hasBearerHeader = true;
      }
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const name = ts.isIdentifier(expression)
        ? expression.text
        : ts.isPropertyAccessExpression(expression)
          ? expression.name.text
          : "";
      if (/^(?:fetch(?:Implementation)?|request|axios|get|post|put|patch|delete)$/u.test(name)) {
        restSignals.hasTransportCall = true;
      }
      const header = node.arguments[0];
      if (
        /^(?:set|append)$/u.test(name) &&
        header !== undefined &&
        ts.isStringLiteralLike(header) &&
        header.text.toLowerCase() === "x-github-api-version"
      ) {
        restSignals.hasApiVersionHeader = true;
      }
    }
    if (ts.isStringLiteralLike(node)) {
      const parent = node.parent;
      const isModule =
        ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
          parent.moduleSpecifier === node) ||
        (ts.isCallExpression(parent) &&
          parent.arguments[0] === node &&
          (parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(parent.expression) && parent.expression.text === "require"))) ||
        (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent));
      if (
        isModule &&
        /(?:^|\/)github-client-factory(?:\.[cm]?[jt]s)?$/u.test(node.text) &&
        sourcePath !== COMPOSITION
      ) {
        violations.add(`${sourcePath}: GitHub client factory`);
      }
      if (isModule && node.text === "@octokit/rest" && sourcePath !== ADAPTER) {
        violations.add(`${sourcePath}: Octokit package`);
      }
      if (
        isModule &&
        /(?:^|\/)octokit-github-client(?:\.[cm]?[jt]s)?$/u.test(node.text) &&
        !concreteAllowed
      ) {
        violations.add(`${sourcePath}: concrete GitHub client`);
      }
    }
    if (ts.isIdentifier(node) && node.text === "OctokitGitHubClient" && !concreteAllowed) {
      violations.add(`${sourcePath}: concrete GitHub client`);
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Octokit" &&
      sourcePath !== ADAPTER
    ) {
      violations.add(`${sourcePath}: Octokit construction`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (
    sourcePath !== ADAPTER &&
    ((restSignals.hasApiRoot && restSignals.hasTransportCall) ||
      (restSignals.hasApiVersionHeader &&
        (restSignals.hasTransportCall || restSignals.hasBearerHeader)))
  ) {
    violations.add(`${sourcePath}: direct GitHub REST transport`);
  }
  return [...violations];
};

describe("GitHub host boundary", () => {
  it("confines production Octokit dependencies to the adapter and factory", () => {
    const violations = PRODUCTION_SOURCE_ROOTS.flatMap((root) =>
      readProductionTypeScriptFiles(path.join(PROJECT_ROOT, root))
    ).flatMap((file) => {
      const relativePath = path.relative(PROJECT_ROOT, file).split(path.sep).join("/");
      return findBoundaryViolations(relativePath, fs.readFileSync(file, "utf8"));
    });
    expect(violations).toEqual([]);
  });

  it("rejects direct GitHub REST transport outside the adapter", () => {
    for (const source of [
      'const root = "https://api.github.com"; fetch(`${root}/repos/org/repo`);',
      'globalThis.fetch("https://api.github.com/repos/org/repo");',
      "fetch(`https://api.github.com/repos/${owner}/${repo}`);",
      'const root = "https://api.github.com"; const headers = { Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "version" }; fetchImplementation(root, { headers });',
      'const headers = { Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "version" }; request(url, { headers });',
      'const headers = new Headers(); headers.set("X-GitHub-Api-Version", "version"); fetch(url, { headers });'
    ]) {
      for (const consumer of [
        FEATURE,
        "ui/electron/templateRepositoryValidationService.ts",
        "ui/electron/templateWorkflowService.ts",
        FACTORY,
        COMPOSITION
      ]) {
        expect(findBoundaryViolations(consumer, source)).toContain(
          `${consumer}: direct GitHub REST transport`
        );
      }
      expect(findBoundaryViolations(ADAPTER, source)).toEqual([]);
    }
  });

  it("allows repository identifiers, generic fetch, and REST examples in comments or strings", () => {
    for (const source of [
      'const repository = "https://github.com/owner/repo";',
      'fetch("https://example.test/resource", { headers: { Authorization: `Bearer ${token}` } });',
      '// fetch("https://api.github.com", { headers: { "X-GitHub-Api-Version": "version" } });',
      'const example = \'fetch("https://api.github.com", { headers: { Authorization: "Bearer token" } })\';',
      'const label = "https://api.github.com";',
      'const label = "X-GitHub-Api-Version"; fetch("https://example.test/resource");'
    ]) {
      expect(findBoundaryViolations(FEATURE, source)).toEqual([]);
    }
  });

  it("permits factory imports only in trusted composition", () => {
    for (const source of [
      'import { createGitHubClient as Client } from "../github/github-client-factory.js";',
      'import type { GitHubClientFactoryOptions } from "../github/github-client-factory.js";',
      'export * from "../github/github-client-factory.js";',
      'const client = import("../github/github-client-factory.js");',
      'const client = require("../github/github-client-factory.js");',
      'type Client = import("../github/github-client-factory.js").GitHubClientFactoryOptions;'
    ]) {
      for (const consumer of [
        FEATURE,
        "src/template-sync/assignment-template-sync-context.ts",
        "src/grading/grading-student-evidence-context.ts",
        "src/grading/grading-student-workflow-repair-context.ts",
        "src/grading/template-managed-workflow-replacement-context.ts",
        "src/grading/grading-student-report-publication-context.ts",
        "ui/electron/example.ts",
        "src/cli/commands/assignment.command.ts"
      ]) {
        expect(findBoundaryViolations(consumer, source)).toContain(
          `${consumer}: GitHub client factory`
        );
      }
      for (const consumer of [COMPOSITION]) {
        expect(findBoundaryViolations(consumer, source)).toEqual([]);
      }
    }
  });

  it("permits the Octokit package only in the adapter", () => {
    for (const source of [
      'import { Octokit } from "@octokit/rest";',
      "import type { Octokit } from '@octokit/rest';",
      'export { Octokit as Client } from "@octokit/rest";',
      'const client = import("@octokit/rest");',
      'const client = require("@octokit/rest");'
    ]) {
      expect(findBoundaryViolations(FEATURE, source)).toContain(`${FEATURE}: Octokit package`);
      expect(findBoundaryViolations(FACTORY, source)).toContain(`${FACTORY}: Octokit package`);
      expect(findBoundaryViolations(ADAPTER, source)).toEqual([]);
    }
  });

  it("confines concrete adapter imports and references to the adapter and factory", () => {
    for (const source of [
      'import { OctokitGitHubClient as Client } from "../github/octokit-github-client.js";',
      'import type { OctokitRestClientLike } from "../github/octokit-github-client.js";',
      'export * from "../github/octokit-github-client.js";',
      'const client = import("../github/octokit-github-client.js");',
      'const client = require("../github/octokit-github-client.js");',
      "const client = new OctokitGitHubClient({ token });",
      "type Client = OctokitGitHubClient;"
    ]) {
      expect(findBoundaryViolations(FEATURE, source)).toContain(
        `${FEATURE}: concrete GitHub client`
      );
      expect(findBoundaryViolations("ui/electron/example.ts", source)).not.toEqual([]);
      expect(findBoundaryViolations(FACTORY, source)).toEqual([]);
      expect(findBoundaryViolations(ADAPTER, source)).toEqual([]);
    }
  });

  it("permits Octokit construction only in the adapter", () => {
    const source = "const client = new Octokit ({ auth: token });";
    expect(findBoundaryViolations(FEATURE, source)).toContain(`${FEATURE}: Octokit construction`);
    expect(findBoundaryViolations(FACTORY, source)).toContain(`${FACTORY}: Octokit construction`);
    expect(findBoundaryViolations(ADAPTER, source)).toEqual([]);
  });

  it("allows the domain contract, models, errors and retry without flagging comments or strings", () => {
    for (const source of [
      'import type { GitHubClient } from "./github-client.js";',
      'import type { GitHubRepository } from "./github-models.js";',
      'import { GitHubClientError } from "./github-errors.js";',
      'import { withGitHubRetry } from "./github-retry.js";',
      '// import { Octokit } from "@octokit/rest"; new Octokit();',
      'const label = "OctokitGitHubClient";'
    ]) {
      expect(findBoundaryViolations(FEATURE, source)).toEqual([]);
    }
  });
});
