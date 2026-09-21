import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["electron/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    // Raised from the 5000ms default alongside src/test/setup.ts's
    // asyncUtilTimeout (also raised to 5000ms) so a slow-but-real
    // findBy*/waitFor resolution under full-suite CPU contention gets its
    // own informative Testing Library error instead of being preempted by
    // a generic vitest test-timeout failure.
    testTimeout: 10000
  }
});
