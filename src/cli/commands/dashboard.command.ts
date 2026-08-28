import type { Command } from "commander";
import { buildDashboard, createEmptyDashboardResult } from "../../dashboard/dashboard-builder.js";
import type { DashboardResult } from "../../dashboard/dashboard-models.js";
import {
  DASHBOARD_JSON_REQUIRED_CODE,
  GITHUB_TOKEN_MISSING_CODE,
  createConfigDiagnostic
} from "../../diagnostics/error-catalog.js";
import type { GitHubClient } from "../../github/github-client.js";
import { resolveProductionGitHubClient } from "../../github/github-client-factory.js";

const COMMAND_NAME = "dashboard";
const JSON_INDENT_SPACES = 2;

interface DashboardCommandOptions {
  readonly json?: boolean;
  readonly term?: string;
}

export interface DashboardCommandRequest {
  readonly cwd: string;
  readonly options: DashboardCommandOptions;
  readonly env?: Record<string, string | undefined>;
  readonly githubClient?: GitHubClient;
}

const createJsonRequiredResult = (): DashboardResult =>
  createEmptyDashboardResult("failure", [
    createConfigDiagnostic(
      DASHBOARD_JSON_REQUIRED_CODE,
      "The dashboard command only supports JSON output. Run with --json."
    )
  ]);

const createTokenMissingResult = (): DashboardResult =>
  createEmptyDashboardResult("failure", [
    createConfigDiagnostic(
      GITHUB_TOKEN_MISSING_CODE,
      "The dashboard command requires GRAIDER_GITHUB_TOKEN so it can check current GitHub status."
    )
  ]);

export const runDashboardCommand = ({
  cwd,
  options,
  env = process.env,
  githubClient
}: DashboardCommandRequest): Promise<DashboardResult> => {
  if (options.json !== true) {
    return Promise.resolve(createJsonRequiredResult());
  }

  const githubResolution = resolveProductionGitHubClient({ githubClient, env });
  if (githubResolution.status === "token_missing") {
    return Promise.resolve(createTokenMissingResult());
  }

  return buildDashboard({
    cwd,
    githubClient: githubResolution.githubClient,
    ...(options.term === undefined ? {} : { term: options.term })
  });
};

export const formatDashboardResultAsJson = (result: DashboardResult): string =>
  JSON.stringify(result, undefined, JSON_INDENT_SPACES);

export const registerDashboardCommand = (program: Command): void => {
  program
    .command(COMMAND_NAME)
    .option("--json", "Required. Emit dashboard JSON")
    .option("--term <termSlug>", "Include only one term")
    .description("Build a UI-ready dashboard model for the current course admin repository.")
    .action(async (options: DashboardCommandOptions) => {
      const result = await runDashboardCommand({
        cwd: process.cwd(),
        options
      });

      console.log(formatDashboardResultAsJson(result));
      process.exitCode = result.exitCode;
    });
};
