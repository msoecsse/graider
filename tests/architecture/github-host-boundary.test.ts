import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADAPTER = "src/github/octokit-github-client.ts";
const FACTORY = "src/github/github-client-factory.ts";
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
  const visit = (node: ts.Node): void => {
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
