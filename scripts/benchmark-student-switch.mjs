/**
 * Run from the repository root: node scripts/benchmark-student-switch.mjs
 * Requires installed root/UI dependencies. No credentials or network calls.
 * Compares the starting commit with the current renderer using the same React
 * harness: snapshot 180ms, source 240ms, saved position 160ms. Reports click to
 * committed selection, snapshot DOM, source DOM, and tracked IPC counts
 * (snapshot, source, saved position, workflow repair).
 * Synthetic timings include test rendering/polling overhead; the mocked repair
 * check resolves immediately, so this does not simulate remote contention.
 * For real application timings, record a switch in Chromium DevTools Performance:
 * graider.student-switch.selection / snapshot / source-visible are User Timing
 * measures without student identifiers. Existing main-process grading performance
 * samples provide service phases and request counts. No real course was benchmarked.
 * Baseline files are temporary and removed even on test failure; do not run this
 * alongside full checks, which could discover those temporary files.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("../", import.meta.url));
const ui = fileURLToPath(new URL("../ui/", import.meta.url));
const directory = new URL("../ui/src/grading-workspace/", import.meta.url);
const baseline = new URL("SwitchBaseline.tsx", directory);
const test = new URL("SwitchBaseline.test.tsx", directory);
const vitest = fileURLToPath(new URL("../ui/node_modules/vitest/vitest.mjs", import.meta.url));
try {
  writeFileSync(
    baseline,
    execFileSync("git", ["show", "47bd41c6:ui/src/grading-workspace/GradingWorkspacePage.tsx"], {
      cwd: root
    })
  );
  writeFileSync(
    test,
    readFileSync(new URL("GradingWorkspacePage.test.tsx", directory), "utf8").replace(
      'from "./GradingWorkspacePage"',
      'from "./SwitchBaseline"'
    )
  );
  for (const target of ["SwitchBaseline", "GradingWorkspacePage"]) {
    execFileSync(process.execPath, [vitest, "run", target, "-t", "benchmarks latency"], {
      cwd: ui,
      stdio: "inherit"
    });
  }
} finally {
  unlinkSync(baseline);
  unlinkSync(test);
}
