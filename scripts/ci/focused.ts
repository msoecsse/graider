import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { Selection } from "./selection.js";
const selection = JSON.parse(
  readFileSync(process.env.CI_SELECTION_PATH ?? "ci-selection.json", "utf8")
) as Selection;
for (const ui of [false, true]) {
  const files = selection.related.filter((file) => file.startsWith("ui/") === ui);
  if (files.length > 0) {
    const cwd = ui ? "ui" : ".";
    const local = files.map((file) => (ui ? file.slice("ui/".length) : file));
    const tests = local.filter((file) => /\.test\.tsx?$/.test(file));
    const sources = local.filter((file) => !/\.test\.tsx?$/.test(file));
    for (const [inputs, args] of [
      [tests, ["run"]],
      [sources, ["related", "--run"]]
    ] as const) {
      if (inputs.length > 0) {
        const result = spawnSync(
          process.execPath,
          ["node_modules/vitest/vitest.mjs", ...args, "--maxWorkers=2", ...inputs],
          { cwd, stdio: "inherit" }
        );
        if (result.status !== 0) process.exit(result.status ?? 1);
      }
    }
  }
}
