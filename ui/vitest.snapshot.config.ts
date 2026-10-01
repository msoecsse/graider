import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts", "src/test/snapshotSetup.ts"],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 10000
  }
});
