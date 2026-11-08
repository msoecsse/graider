import type { Command } from "commander";
import { loadGraiderConfig } from "../config/config-loader.js";
import { resolveProductionGitHubClient } from "../github/github-client-composition.js";
import { createDugiteGitWorkspaceFactory } from "../git/dugite-git-workspace-context.js";
import { beginAuthoritativeLegacyCliMutation } from "../execution/authoritative-legacy-course.js";
import { createRemoteName } from "../git/git-workspace.js";

const MUTATING_COMMANDS: readonly string[] = [
  "apply",
  "grade",
  "download-repositories",
  "generate",
  "report"
];
export class LegacyCliMutationUnavailable extends Error {
  constructor(
    readonly commandName: string,
    readonly assignmentFile: string,
    readonly json: boolean
  ) {
    super(
      "Current authoritative schema, revision and account evidence are required. Synchronize the course or use its supported managed operation. No action was started."
    );
  }
}
/** CLI actions run only after this check; no local cache or environment support flag can bypass it. */
export const checkLegacyCliMutation = async (command: Command): Promise<void> => {
  if (!MUTATING_COMMANDS.includes(command.name())) return;
  const assignment = command.args[0];
  if (!assignment) return; // The command's argument/config validator will refuse it.
  const loaded = loadGraiderConfig({ cwd: process.cwd(), assignmentFile: assignment });
  if (loaded.status !== "success") return; // Existing typed config errors, before any writer.
  try {
    const client = resolveProductionGitHubClient();
    if (client.status !== "available") {
      // These commands already return their established typed token-required result,
      // before any writer. Local workflow generation has no such guard of its own.
      if (command.name() !== "generate") return;
      throw new Error("Authorize GitHub before course mutations.");
    }
    const workspace = await createDugiteGitWorkspaceFactory().open(loaded.config.summary.repoRoot);
    const origin = createRemoteName("origin");
    if (!origin) throw new Error("Course origin is unavailable.");
    await beginAuthoritativeLegacyCliMutation({
      root: loaded.config.summary.repoRoot,
      client: client.githubClient,
      remoteUrl: (await workspace.remoteUrl(origin)) ?? "",
      localRevision: await workspace.resolveHead()
    });
  } catch {
    const parent = command.parent?.name();
    const commandName =
      parent && parent !== "graider" ? `${parent} ${command.name()}` : command.name();
    throw new LegacyCliMutationUnavailable(commandName, assignment, command.opts().json === true);
  }
};
