import { appendFileSync } from "node:fs";
// Node 24 can erase this dependency-free policy's TypeScript directly. The URL
// keeps native execution independent of tsx and avoids installing dependencies.
const { gateFailures } = (await import(
  new URL("./selection.ts", import.meta.url).href
)) as typeof import("./selection.js");
const results = JSON.parse(process.env.CI_NEEDS ?? "{}") as Record<
  string,
  { result: string; outputs?: Record<string, string> }
>;
const failures = gateFailures(results.select?.outputs ?? {}, results);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Required CI gate\n\n${Object.entries(results)
      .map(([job, value]) => `- ${job}: ${value.result}`)
      .join("\n")}\n\n${failures.length ? failures.join("\n") : "Every selected job succeeded."}\n`
  );
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
