export default {
  entry: ["src/cli/index.ts"],
  format: ["esm"],
  outDir: "ui/dist-graider-cli",
  clean: true,
  dts: false,
  target: "es2024",
  banner: {
    js: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);'
  },
  noExternal: ["@octokit/rest", "commander", "yaml", "zod"]
};
