import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".codex",
  "dist",
  "dist-electron",
  "dist-graider-cli",
  "dist-release",
  "release",
  "coverage",
  ".ui-snapshots"
]);
const TEST_NAMES = new Set(["it", "test", "describe", "suite"]);
const DISABLED_ALIASES = new Set(["xit", "xtest", "xdescribe", "fit", "ftest", "fdescribe"]);
const PROHIBITED_MODIFIERS = new Set(["skip", "only", "todo"]);

export interface HygieneViolation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly declaration: string;
}

/** Parse without resolving dependencies: symbols still distinguish local bindings and imports. */
export function inspectTestSource(file: string, source: string): HygieneViolation[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const host = ts.createCompilerHost({ noResolve: true });
  host.getSourceFile = (name) => (name === file ? sourceFile : undefined);
  const program = ts.createProgram([file], { noResolve: true, noLib: true }, host);
  const checker = program.getTypeChecker();
  const violations: HygieneViolation[] = [];

  const importPath = (node: ts.Node): string | undefined => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      return node.moduleSpecifier.text;
    }
    return ts.isSourceFile(node) ? undefined : importPath(node.parent);
  };

  const declarationPath = (expression: ts.Expression, seen = new Set<ts.Symbol>()): string[] => {
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isNonNullExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    ) {
      return declarationPath(expression.expression, seen);
    }
    if (ts.isCallExpression(expression) || ts.isTaggedTemplateExpression(expression)) {
      return declarationPath(
        ts.isCallExpression(expression) ? expression.expression : expression.tag,
        seen
      );
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const base = declarationPath(expression.expression, seen);
      const property = ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : ts.isStringLiteralLike(expression.argumentExpression)
          ? expression.argumentExpression.text
          : undefined;
      return base.length > 0 && property !== undefined ? [...base, property] : [];
    }
    if (ts.isIdentifier(expression)) {
      const symbol = checker.getSymbolAtLocation(expression);
      if (!symbol) {
        return TEST_NAMES.has(expression.text) || DISABLED_ALIASES.has(expression.text)
          ? [expression.text]
          : [];
      }
      if (seen.has(symbol)) {
        return [];
      }
      const nextSeen = new Set([...seen, symbol]);
      const declaration = symbol.declarations?.[0];
      if (declaration && importPath(declaration) === "vitest") {
        if (ts.isImportSpecifier(declaration)) {
          return [(declaration.propertyName ?? declaration.name).text];
        }
        if (ts.isNamespaceImport(declaration)) {
          return ["vitest"];
        }
      }
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
        return declarationPath(declaration.initializer, nextSeen);
      }
      if (
        declaration &&
        ts.isBindingElement(declaration) &&
        ts.isObjectBindingPattern(declaration.parent) &&
        ts.isVariableDeclaration(declaration.parent.parent) &&
        declaration.parent.parent.initializer
      ) {
        const base = declarationPath(declaration.parent.parent.initializer, nextSeen);
        const property = declaration.propertyName ?? declaration.name;
        if (base.length > 0 && (ts.isIdentifier(property) || ts.isStringLiteralLike(property))) {
          return [...base, property.text];
        }
      }
    }
    return [];
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const path = declarationPath(node.expression);
      const names = path[0] === "vitest" ? path.slice(1) : path;
      const [name, ...modifiers] = names;
      const lastModifier = modifiers[modifiers.length - 1];
      const condition = node.arguments[0];
      const unconditional =
        (lastModifier === "skipIf" && condition?.kind === ts.SyntaxKind.TrueKeyword) ||
        (lastModifier === "runIf" && condition?.kind === ts.SyntaxKind.FalseKeyword);
      const disabledOptions = node.arguments
        .slice(1)
        .some(
          (argument) =>
            ts.isObjectLiteralExpression(argument) &&
            argument.properties.some(
              (property) =>
                ts.isPropertyAssignment(property) &&
                (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
                PROHIBITED_MODIFIERS.has(property.name.text) &&
                property.initializer.kind === ts.SyntaxKind.TrueKeyword
            )
        );
      if (
        name &&
        (DISABLED_ALIASES.has(name) ||
          (TEST_NAMES.has(name) &&
            (modifiers.some((modifier) => PROHIBITED_MODIFIERS.has(modifier)) ||
              unconditional ||
              disabledOptions)))
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({
          file,
          line: position.line + 1,
          column: position.character + 1,
          declaration: names.join(".")
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

export async function checkTestHygiene(root: string): Promise<HygieneViolation[]> {
  const violations: HygieneViolation[] = [];
  const scan = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
        await scan(path);
      } else if (entry.isFile() && TEST_FILE.test(entry.name)) {
        violations.push(...inspectTestSource(relative(root, path), await readFile(path, "utf8")));
      }
    }
  };
  await scan(root);
  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const violations = await checkTestHygiene(root);
  for (const violation of violations) {
    console.error(
      `${violation.file}:${String(violation.line)}:${String(violation.column)}: prohibited Vitest declaration ${violation.declaration}`
    );
  }
  if (violations.length > 0) {
    console.error(
      "Fix the test or track the blocker; do not commit skipped, focused, or todo tests."
    );
    process.exitCode = 1;
  } else {
    console.log("Test hygiene passed: no skipped, focused, or todo declarations.");
  }
}
