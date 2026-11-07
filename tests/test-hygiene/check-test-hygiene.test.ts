import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkTestHygiene, inspectTestSource } from "../../scripts/check-test-hygiene.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (path) => {
      await rm(path, { recursive: true, force: true });
    })
  );
});

describe("test hygiene guard", () => {
  it.each([
    'it.skip("disabled", () => {});',
    'test.only("focused", () => {});',
    'describe.skip("disabled", () => {});',
    'suite.only("focused", () => {});',
    'it.todo("unfinished");',
    'test["skip"]("disabled", () => {});',
    'describe.concurrent.only("focused", () => {});',
    'it.skip.each([1])("disabled", () => {});',
    'test.each([1]).only("focused", () => {});',
    'it.only.each`value\n${1}`("focused", () => {});',
    'it.skipIf(true)("disabled", () => {});',
    'test.runIf(false)("disabled", () => {});',
    'test("disabled", { skip: true }, () => {});',
    'describe("focused", { only: true }, () => {});',
    'it("unfinished", { todo: true });',
    'import * as v from "vitest"; const { test: check } = v; check.only("focused", () => {});',
    'xit("disabled", () => {});',
    'xtest("disabled", () => {});',
    'xdescribe("disabled", () => {});',
    'fit("focused", () => {});',
    'ftest("focused", () => {});',
    'fdescribe("focused", () => {});',
    'import { test as check } from "vitest"; check.only("focused", () => {});',
    'import { xit as check } from "vitest"; check("disabled", () => {});',
    'import * as v from "vitest"; v.describe.skip("disabled", () => {});',
    'import { it } from "vitest"; const check = it; check.skip("disabled", () => {});',
    'import { test } from "vitest"; const check = test.only; check("focused", () => {});'
  ])("rejects prohibited declaration: %s", (source) => {
    expect(inspectTestSource("example.test.ts", source).length).toBeGreaterThan(0);
  });

  it.each([
    'import { it, describe } from "vitest"; describe("suite", () => { it("works", () => {}); });',
    'test.each([1])("works", () => {});',
    'it.concurrent("works", () => {});',
    'test("works", { skip: false, only: false }, () => {});',
    'it("renders", () => { const element = <div>test.only</div>; });',
    '// it.skip("comment", () => {});\n/* test.only("comment") */',
    'const text = "describe.skip()"; const template = `it.only()`; const pattern = /test.only/;',
    "const unrelated = { skip() {}, only() {} }; unrelated.skip(); unrelated.only();",
    "const test = { skip() {} }; test.skip();",
    'import { test } from "other-library"; test.only();',
    'import { it } from "vitest"; function example(it: { only(): void }) { it.only(); }',
    'import * as v from "other-library"; v.test.only();',
    'it.runIf(process.platform === "darwin")("platform proof", () => {});'
  ])("accepts ordinary code: %s", (source) => {
    expect(inspectTestSource("example.test.tsx", source)).toEqual([]);
  });

  it("reports actionable source positions", () => {
    expect(inspectTestSource("example.test.ts", '\n  it.skip("disabled", () => {});')).toEqual([
      { file: "example.test.ts", line: 2, column: 3, declaration: "it.skip" }
    ]);
  });

  it("scans root and UI TS/TSX tests and ignores dependencies and generated output", async () => {
    const root = await mkdtemp(join(tmpdir(), "graider test hygiene "));
    temporaryDirectories.push(root);
    const files = [
      "tests/root.test.ts",
      "tests/root.spec.tsx",
      "ui/src/view.test.tsx",
      "ui/electron/main.test.ts"
    ];
    const ignored = [
      "node_modules/library.test.ts",
      "ui/node_modules/library.test.ts",
      "ui/dist/view.test.tsx",
      "notes.ts"
    ];
    await Promise.all(
      [...files, ...ignored].map(async (file) => {
        const path = join(root, file);
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, 'import { it } from "vitest"; it.skip("disabled", () => {});');
      })
    );
    const violations = await checkTestHygiene(root);
    expect(violations.map((violation) => violation.file).sort()).toEqual(
      files.map((file) => join(...file.split("/"))).sort()
    );
  });
});
