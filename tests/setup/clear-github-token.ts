/**
 * The offline suites assert how commands behave with no GitHub credentials available. They read
 * `process.env` directly, so a token in the developer's shell silently turns those assertions
 * into their opposite -- and the CLI-shell tests spawn subprocesses that inherit it too.
 *
 * Clearing the token names here makes the offline run independent of the ambient environment.
 * Live tests need the real token and are excluded from this setup by `vitest.config.ts`.
 */
delete process.env.GRAIDER_GITHUB_TOKEN;
delete process.env.GITHUB_TOKEN;
