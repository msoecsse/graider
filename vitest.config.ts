import { defineConfig } from "vitest/config";

const LIVE_TEST_PATTERN = "tests/live/**/*.test.ts";
const LIVE_TEST_ARGUMENT = "tests/live";
const isLiveTestRun = process.argv.some((argument) => argument.includes(LIVE_TEST_ARGUMENT));

export default defineConfig({
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    exclude: isLiveTestRun ? [] : [LIVE_TEST_PATTERN],
    restoreMocks: true,
    clearMocks: true
  }
});
