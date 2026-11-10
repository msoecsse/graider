import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { AppServer } from "./app-server.js";
import { planSchema } from "./contracts.js";
import { Host } from "./host.js";
import { supervise, withLock } from "./runner.js";
import { Timing } from "./timing.js";
import { StopError } from "./errors.js";
import { TerminalApprovals } from "./approvals.js";

const timing = new Timing();
const approvals = new TerminalApprovals();
let reportDirectory: string | undefined;

const command = new Command()
  .description("Guarded serial Codex issue orchestrator; separate from Electron")
  .requiredOption("--plan <file>", "explicit ordered plan and scoped delegation")
  .requiredOption("--state <directory>", "report/checkpoint directory outside worktree")
  .option("--execute", "execute the operator-approved plan (default dry run)")
  .option("--resume", "resume only between completed issues")
  .option("--codex <executable>", "Codex native executable path", "codex");
command.parse();
const options = command.opts<{
  plan: string;
  state: string;
  execute?: boolean;
  resume?: boolean;
  codex: string;
}>();
const abort = new AbortController();
process.once("SIGINT", () => {
  abort.abort();
});
process.once("SIGTERM", () => {
  abort.abort();
});
const progress = (stage: string): void => {
  console.log(`[${new Date().toISOString()}] ${stage}`);
};
try {
  const agent = new AppServer(options.codex, approvals.request, progress);
  if (options.execute) agent.assertIsolation();
  const plan = planSchema.parse(JSON.parse(await readFile(options.plan, "utf8")) as unknown);
  const cwd = await realpath(process.cwd());
  const state = path.resolve(options.state);
  const parent = await realpath(path.dirname(state));
  let canonicalState = path.join(parent, path.basename(state));
  try {
    canonicalState = await realpath(state);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  if (
    [parent, canonicalState].some((value) => value === cwd || value.startsWith(`${cwd}${path.sep}`))
  )
    throw new StopError("State must be outside the worktree.");
  reportDirectory = canonicalState;
  const host = new Host(plan, cwd, abort.signal, timing);
  const commonDir = path.resolve(cwd, (await host.git(["rev-parse", "--git-common-dir"])).trim());
  await withLock(path.join(commonDir, "graider-orchestrator.lock"), async () => {
    await supervise(
      host,
      agent,
      state,
      options.resume ?? false,
      !(options.execute ?? false),
      progress
    );
  });
  progress(`Finished. Reports: ${reportDirectory}`);
} catch (error) {
  const reason =
    error instanceof StopError
      ? error.message
      : "Validation, cancellation, or runtime failure; raw diagnostics withheld to protect credentials.";
  timing.event("stopped", reason);
  console.error(
    `Orchestrator stopped: ${reason} Review checkpoint/report and repository state; no automatic implementation retry.`
  );
  process.exitCode = 1;
} finally {
  approvals.close();
  if (reportDirectory) {
    await mkdir(reportDirectory, { recursive: true });
    const report = timing.snapshot();
    await writeFile(path.join(reportDirectory, "invocation.json"), JSON.stringify(report, null, 2));
    await writeFile(
      path.join(reportDirectory, "invocation.txt"),
      `Total invocation wall time: ${String(report.totalMs)}ms\nExclusive attribution: ${JSON.stringify(report.exclusiveMs)}\nApproval requests and waits: ${JSON.stringify(report.approvals)}\nCI remote metrics are separate; see per-issue reports.\n`
    );
  }
}
