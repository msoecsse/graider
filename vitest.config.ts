import { defineConfig } from "vitest/config";

const LIVE_TEST_PATTERN = "tests/live/**/*.test.ts";
const CLEAR_TOKEN_SETUP_FILE = "tests/setup/clear-github-token.ts";
const LIVE_TEST_ARGUMENT = "tests/live";
const isLiveTestRun = process.argv.some((argument) => argument.includes(LIVE_TEST_ARGUMENT));

export default defineConfig({
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    exclude: isLiveTestRun ? [] : [LIVE_TEST_PATTERN],
    restoreMocks: true,
    clearMocks: true,
    // Live tests authenticate for real; every other suite must not see an ambient token.
    setupFiles: isLiveTestRun ? [] : [CLEAR_TOKEN_SETUP_FILE]
  }
});
