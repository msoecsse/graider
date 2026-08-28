import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export const PRODUCTION_ASSET_BASE = "./";

export default defineConfig({
  base: PRODUCTION_ASSET_BASE,
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
