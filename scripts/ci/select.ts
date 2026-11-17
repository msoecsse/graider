import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fullSelection, parseChanges, selectChanges, type Selection } from "./selection.js";

interface Event {
  before?: string;
  pull_request?: { base: { sha: string }; head: { sha: string } };
  inputs?: { full_regression?: boolean | string };
}
const eventName = process.env.GITHUB_EVENT_NAME;
const ref = process.env.GITHUB_REF ?? "";
const MAX_DIFF_BYTES = 67_108_864;
const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: MAX_DIFF_BYTES });
const shaPattern = /^[a-f0-9]{40}$/;
let selection: Selection;
try {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as Event;
  const comprehensive =
    eventName === "pull_request" ||
    eventName === "schedule" ||
    ref === "refs/heads/master" ||
    ref.startsWith("refs/heads/release/") ||
    event.inputs?.full_regression === true ||
    event.inputs?.full_regression === "true";
  if (comprehensive)
    selection = fullSelection(
      "Comprehensive PR, release, default branch or explicit full regression"
    );
  else {
    const head = process.env.GITHUB_SHA ?? "";
    const base = process.env.CI_BASE_SHA ?? "";
    if (!shaPattern.test(base) || !shaPattern.test(head) || /^0+$/.test(base))
      throw new Error("Missing comparison SHA");
    git("merge-base", "--is-ancestor", base, head);
    const changes = parseChanges(
      git("diff", "--no-renames", "--name-status", "-z", base, head, "--")
    );
    // Follow all static renderer imports across feature directories. Unknown/shared importers
    // select full regression; backend and generated bridge dependencies already fail full.
    const files = git("ls-files", "-z", "ui/src", "ui/electron", "src", "tests", "scripts")
      .split("\0")
      .filter((file) => /\.(tsx?|css)$/.test(file));
    const reverse = new Map<string, string[]>();
    const options: ts.CompilerOptions = {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve
    };
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (file.startsWith("ui/src/") && !file.endsWith(".css")) {
        const hasComputedImport = (node: ts.Node): boolean => {
          if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const target = node.arguments[0];
            if (!target || !ts.isStringLiteral(target)) return true;
          }
          return ts.forEachChild(node, hasComputedImport) ?? false;
        };
        if (hasComputedImport(ts.createSourceFile(file, source, ts.ScriptTarget.Latest)))
          throw new Error(`Untraceable renderer import: ${file}`);
      }

      const imports = file.endsWith(".css")
        ? [...source.matchAll(/@import\s+["']([^"']+)["']/g)].map((match) => ({
            fileName: match[1] ?? ""
          }))
        : ts.preProcessFile(source, true, true).importedFiles;
      for (const imported of imports) {
        if (imported.fileName.startsWith(".")) {
          const resolved = ts.resolveModuleName(
            imported.fileName,
            path.resolve(file),
            options,
            ts.sys
          ).resolvedModule?.resolvedFileName;
          const dependency = resolved
            ? path.relative(process.cwd(), resolved).split(path.sep).join("/")
            : path.posix.normalize(path.posix.join(path.posix.dirname(file), imported.fileName));
          reverse.set(dependency, [...(reverse.get(dependency) ?? []), file]);
        }
      }
    }
    const impacted = new Set(changes.map((change) => change.path));
    for (const file of impacted)
      for (const importer of reverse.get(file) ?? []) impacted.add(importer);
    // App composition roots import every feature; they do not introduce new domain behavior.
    const domainImporters = [...impacted].filter(
      (file) => !/^ui\/src\/(App|AppRoutes|main)(\.test)?\.tsx$/.test(file)
    );
    selection = selectChanges(changes, domainImporters);
    const sharedImporter = domainImporters.find(
      (file) =>
        !changes.some((change) => change.path === file) &&
        !/^ui\/src\/(assignment-detail|assignment-edit|assignment-setup|apply-preview|comment-library|course-setup|dashboard|faculty-report|grade-preview|grade-status|grading-workspace|migration-review|review-import|roster-manager)\/[^/]+\.(tsx?|css)$/.test(
          file
        )
    );
    if (sharedImporter) selection = fullSelection(`Shared or unknown importer: ${sharedImporter}`);
    selection.reasons.unshift(`Comparison: ${base}..${head}`);
  }
} catch (error) {
  selection = fullSelection(
    `Change detection failed: ${error instanceof Error ? error.message : "unknown error"}`
  );
}
writeFileSync("ci-selection.json", JSON.stringify(selection));
if (process.env.GITHUB_OUTPUT)
  for (const [job, enabled] of Object.entries(selection.jobs))
    appendFileSync(process.env.GITHUB_OUTPUT, `${job}=${String(enabled)}\n`);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## CI selection\n\nSelected: ${
      Object.entries(selection.jobs)
        .filter(([, enabled]) => enabled)
        .map(([job]) => job)
        .join(", ") || "fast feedback only"
    }\n\n${selection.reasons.map((reason) => `- ${reason.replaceAll("\n", " ")}`).join("\n")}\n`
  );
console.log(JSON.stringify(selection, null, 2));
