import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export const PRODUCTION_ASSET_BASE = "./";

const pdfAssets = fileURLToPath(
  new URL("./node_modules/.cache/graider-pdf-assets", import.meta.url)
);
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  fs.cpSync(
    fileURLToPath(new URL(`./node_modules/pdfjs-dist/${directory}`, import.meta.url)),
    path.join(pdfAssets, "pdfjs", directory),
    { recursive: true }
  );
}

export default defineConfig({
  publicDir: pdfAssets,
  base: PRODUCTION_ASSET_BASE,
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        fileURLToPath(new URL("../src/diagnostics", import.meta.url)),
        fileURLToPath(new URL("../src/io", import.meta.url)),
        fileURLToPath(new URL("../src/roster", import.meta.url))
      ]
    }
  }
});
