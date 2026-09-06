import { fileURLToPath } from "node:url";
import { build } from "tsup";

await build({
  entry: {
    assignmentTemplateSyncBackend: fileURLToPath(
      new URL("../../src/template-sync/assignment-template-sync-context.ts", import.meta.url)
    )
  },
  outDir: fileURLToPath(new URL("../dist-electron", import.meta.url)),
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  target: "node24",
  clean: false,
  dts: false,
  noExternal: ["@octokit/rest", "yaml", "zod"]
});
