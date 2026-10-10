import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentFile = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(currentFile), "..", "..");
const PRODUCTION_SOURCE_ROOTS = ["src", path.join("ui", "electron")] as const;
const APPROVED_CHILD_PROCESS_IMPORTS = new Set(["ui/electron/commandRunner.ts"]);
const CHILD_PROCESS_MODULE_PATTERN =
  /(?:from\s*["'](?:node:)?child_process["']|require\(\s*["'](?:node:)?child_process["']\s*\))/u;
const DIRECT_GIT_PROCESS_REQUEST_PATTERN =
  /(?:command\s*:\s*["']git(?:\.exe)?["']|(?:execFile(?:Sync)?|executeFile|spawn(?:Sync)?)\s*\(\s*["']git(?:\.exe)?["'])/iu;

const toRelativePath = (sourcePath: string): string =>
  path.relative(PROJECT_ROOT, sourcePath).split(path.sep).join("/");

const isProductionTypeScriptFile = (entry: fs.Dirent): boolean =>
  entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts");

const readProductionTypeScriptFiles = (directory: string): readonly string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return readProductionTypeScriptFiles(entryPath);
    }

    return isProductionTypeScriptFile(entry) ? [entryPath] : [];
  });

const importsChildProcess = (source: string): boolean => CHILD_PROCESS_MODULE_PATTERN.test(source);

const requestsGitThroughProcessRunner = (source: string): boolean =>
  DIRECT_GIT_PROCESS_REQUEST_PATTERN.test(source);

const findChildProcessImportViolations = (sourceFiles: readonly string[]): readonly string[] =>
  sourceFiles
    .filter((sourcePath) => importsChildProcess(fs.readFileSync(sourcePath, "utf8")))
    .map(toRelativePath)
    .filter((sourcePath) => !APPROVED_CHILD_PROCESS_IMPORTS.has(sourcePath));

const findDirectGitProcessRequestViolations = (sourceFiles: readonly string[]): readonly string[] =>
  sourceFiles
    .filter((sourcePath) => requestsGitThroughProcessRunner(fs.readFileSync(sourcePath, "utf8")))
    .map(toRelativePath);

describe("local Git execution boundary", () => {
  it("routes production Git through the semantic command workspace and Dugite", () => {
    const sourceFiles = PRODUCTION_SOURCE_ROOTS.flatMap((sourceRoot) =>
      readProductionTypeScriptFiles(path.join(PROJECT_ROOT, sourceRoot))
    );

    expect(findChildProcessImportViolations(sourceFiles)).toEqual([]);
    expect(findDirectGitProcessRequestViolations(sourceFiles)).toEqual([]);
  });

  it("contains no production implementation that launches Git from PATH", () => {
    const sourceFiles = PRODUCTION_SOURCE_ROOTS.flatMap((sourceRoot) =>
      readProductionTypeScriptFiles(path.join(PROJECT_ROOT, sourceRoot))
    );
    expect(findDirectGitProcessRequestViolations(sourceFiles)).toEqual([]);
  });

  it("recognizes approved and forbidden child-process imports", () => {
    expect(importsChildProcess('import { spawn } from "node:child_process";')).toBe(true);
    expect(importsChildProcess('const childProcess = require("child_process");')).toBe(true);
    expect(importsChildProcess('import path from "node:path";')).toBe(false);

    const commandRunnerPath = path.join(PROJECT_ROOT, "ui/electron/commandRunner.ts");

    expect(importsChildProcess(fs.readFileSync(commandRunnerPath, "utf8"))).toBe(true);
    expect(findChildProcessImportViolations([commandRunnerPath])).toEqual([]);
    expect(
      APPROVED_CHILD_PROCESS_IMPORTS.has("src/repository-download/repository-download.ts")
    ).toBe(false);
  });

  it("recognizes explicit direct-Git process requests without flagging other commands", () => {
    expect(requestsGitThroughProcessRunner('run({ command: "git", args: [] });')).toBe(true);
    expect(requestsGitThroughProcessRunner("run({ command: 'git.exe', args: [] });")).toBe(true);
    for (const call of ["execFile", "execFileSync", "executeFile", "spawn", "spawnSync"]) {
      expect(requestsGitThroughProcessRunner(`${call}("git", []);`)).toBe(true);
      expect(requestsGitThroughProcessRunner(`${call}('git.exe', []);`)).toBe(true);
    }
    expect(requestsGitThroughProcessRunner('run({ command: "graider", args: [] });')).toBe(false);
    expect(
      requestsGitThroughProcessRunner('const remote = "https://github.com/org/git.git";')
    ).toBe(false);
  });
});

it("requires an explicit authentication request in the Electron publication writer", () => {
  const filename = path.join(PROJECT_ROOT, "ui/electron/gitWorkspaceReader.ts");
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const writer = source.statements.find(
    (statement) =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === "GitWorkspaceWriter"
  );
  if (writer === undefined || !ts.isInterfaceDeclaration(writer))
    throw new Error("Missing writer contract.");
  const push = writer.members.find(
    (member) => ts.isMethodSignature(member) && member.name.getText(source) === "pushUpstream"
  );
  if (push === undefined || !ts.isMethodSignature(push)) throw new Error("Missing push contract.");
  expect(push.parameters).toHaveLength(1);
  const request = push.parameters[0];
  expect(request?.questionToken).toBeUndefined();
  expect(request?.initializer).toBeUndefined();
  if (request?.type === undefined || !ts.isTypeLiteralNode(request.type))
    throw new Error("Missing request type.");
  const authentication = request.type.members[0];
  if (authentication === undefined || !ts.isPropertySignature(authentication))
    throw new Error("Missing authentication.");
  expect(authentication.name.getText(source)).toBe("authentication");
  expect(authentication.questionToken).toBeUndefined();
  expect(authentication.type?.getText(source)).toBe("GitAuthenticationContextRef");
});
