import { StopError } from "./errors.js";
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { exec as executeBundledGit } from "dugite";
import { authorize, type Check, type Issue, type Plan } from "./contracts.js";
import { Timing } from "./timing.js";

const execute = promisify(execFile);
const MAX_OUTPUT_BYTES = 10_485_760;
const COMMAND_TIMEOUT_MS = 1_800_000;
export type ProcessRunner = (
  file: string,
  args: string[],
  cwd: string,
  signal: AbortSignal
) => Promise<string>;
export const runProcess: ProcessRunner = async (file, args, cwd, signal) => {
  try {
    return (
      await execute(file, args, {
        cwd,
        signal,
        shell: false,
        windowsHide: true,
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: COMMAND_TIMEOUT_MS
      })
    ).stdout;
  } catch {
    throw new StopError(
      "Process failed or was cancelled; raw output withheld to protect credentials."
    );
  }
};
const issueResponse = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  labels: z.array(z.object({ name: z.string() }))
});
const checksResponse = z.object({
  check_runs: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable(),
      started_at: z.string().nullable(),
      completed_at: z.string().nullable()
    })
  )
});
export const brokerSchema = z
  .object({
    action: z.enum(["issue-create", "issue-update", "issue-close", "issue-label", "validate"]),
    number: z.number().int().positive().optional(),
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    labels: z.array(z.string().min(1)).optional(),
    validation: z
      .enum(["typecheck", "lint", "format:check", "test", "build", "test:hygiene"])
      .optional()
  })
  .strict();
export class Host {
  private sequence = 0;
  private async activity<T>(kind: string, operation: () => Promise<T>): Promise<T> {
    const id = `${kind}:${String(++this.sequence)}`;
    this.timing.start(id, "tool");
    try {
      return await operation();
    } finally {
      this.timing.end(id);
    }
  }
  constructor(
    readonly plan: Plan,
    readonly cwd: string,
    readonly signal: AbortSignal,
    readonly timing: Timing,
    private readonly processRunner: ProcessRunner = runProcess
  ) {}
  async git(args: string[]): Promise<string> {
    this.signal.throwIfAborted();
    try {
      return await this.activity("git", async () => {
        const result = await executeBundledGit(
          ["-c", "color.ui=false", "-c", "core.quotepath=false", ...args],
          this.cwd,
          { signal: this.signal, maxBuffer: MAX_OUTPUT_BYTES, env: { GIT_TERMINAL_PROMPT: "0" } }
        );
        if (result.exitCode !== 0) throw new StopError("Bundled Git operation failed.");
        return result.stdout;
      });
    } catch {
      throw new StopError("Bundled Git operation failed.");
    }
  }
  async gh(args: string[]): Promise<string> {
    return this.activity("github-cli", async () =>
      this.processRunner("gh", args, this.cwd, this.signal)
    );
  }
  async api(endpoint: string): Promise<unknown> {
    return JSON.parse(
      await this.gh(["api", `repos/${this.plan.repository}/${endpoint}`])
    ) as unknown;
  }
  async permissions(): Promise<boolean> {
    const response = await this.gh(["api", "--include", `repos/${this.plan.repository}`]);
    const separator = /\r?\n\r?\n/.exec(response);
    if (!separator) return false;
    const headers = response.slice(0, separator.index);
    const scopes = /^x-oauth-scopes:\s*(.*)$/im
      .exec(headers)?.[1]
      ?.split(",")
      .map((scope) => scope.trim());
    // Uninspectable fine-grained/app grants are indeterminate, not implicitly authorized.
    if (!scopes?.includes("repo")) return false;
    const value: unknown = JSON.parse(response.slice(separator.index + separator[0].length));
    return z
      .object({
        permissions: z.object({ push: z.literal(true) }),
        has_issues: z.literal(true),
        archived: z.literal(false)
      })
      .safeParse(value).success;
  }
  async issue(number: number): Promise<Issue> {
    const value = issueResponse.parse(await this.api(`issues/${String(number)}`));
    const pages = z
      .array(z.array(z.object({ number: z.number(), state: z.string() })))
      .parse(
        JSON.parse(
          await this.gh([
            "api",
            "--paginate",
            "--slurp",
            `repos/${this.plan.repository}/issues/${String(number)}/dependencies/blocked_by`
          ])
        ) as unknown
      );
    // Text references with explicit dependency wording supplement native GitHub dependencies.
    const textual = [
      ...(value.body ?? "").matchAll(/(?:depends on|blocked by|requires)\s+#(\d+)/gi)
    ].map((match) => Number(match[1]));
    return {
      ...value,
      body: value.body ?? "",
      labels: value.labels.map((label) => label.name),
      dependencies: [
        ...new Set([...pages.flat().map((dependency) => dependency.number), ...textual])
      ]
    };
  }
  async checks(sha: string): Promise<Check[]> {
    const pages = z
      .array(checksResponse)
      .parse(
        JSON.parse(
          await this.gh([
            "api",
            "--paginate",
            "--slurp",
            `repos/${this.plan.repository}/commits/${sha}/check-runs?per_page=100`
          ])
        ) as unknown
      );
    return pages.flatMap((page) => page.check_runs);
  }
  async guard(clean: boolean): Promise<string> {
    const root = await realpath((await this.git(["rev-parse", "--show-toplevel"])).trim());
    if (root !== (await realpath(this.cwd))) throw new StopError("Run from the repository root.");
    const branch = (await this.git(["branch", "--show-current"])).trim();
    const remote = (await this.git(["remote", "get-url", "origin"])).trim();
    if (
      branch !== this.plan.branch ||
      ![
        `https://github.com/${this.plan.repository}.git`,
        `https://github.com/${this.plan.repository}`,
        `git@github.com:${this.plan.repository}.git`
      ].includes(remote)
    )
      throw new StopError("Unexpected repository or branch.");
    if (clean && (await this.git(["status", "--porcelain=v1", "--untracked-files=all"])).trim())
      throw new StopError("Worktree must be clean.");
    return (await this.git(["rev-parse", "HEAD"])).trim();
  }
  async broker(input: unknown): Promise<string> {
    const request = brokerSchema.parse(input);
    authorize(this.plan, request.action);
    await this.guard(false);
    if (request.action === "validate") {
      if (!request.validation) throw new StopError("Validation command required.");
      const npmCli = process.env.npm_execpath;
      if (!npmCli || !path.isAbsolute(npmCli) || !/npm-cli\.js$/i.test(npmCli))
        throw new StopError("Launch with npm run orchestrate to locate npm cross-platform.");
      const category =
        request.validation === "test" || request.validation === "test:hygiene"
          ? "test"
          : request.validation === "build"
            ? "build"
            : request.validation === "typecheck"
              ? "typecheck"
              : "lint";
      this.timing.start("validation", category);
      try {
        await this.processRunner(
          process.execPath,
          [npmCli, "run", request.validation],
          this.cwd,
          this.signal
        );
      } finally {
        this.timing.end("validation");
      }
      return "Validation passed.";
    }
    const args = [
      "issue",
      request.action === "issue-create"
        ? "create"
        : request.action === "issue-close"
          ? "close"
          : "edit"
    ];
    if (request.action !== "issue-create") {
      if (!request.number) throw new StopError("Issue number required.");
      args.push(String(request.number));
    }
    args.push("--repo", this.plan.repository);
    if (request.action === "issue-close") {
      // Queue issue closure belongs to the supervisor, after CI verification.
      if (this.plan.issues.some((entry) => entry.number === request.number))
        throw new StopError("Supervisor closes queue issues after green CI.");
      if (
        (await this.issue(request.number ?? 0)).labels.some((label) =>
          /blocked|needs-human-decision/i.test(label)
        )
      )
        throw new StopError("Cannot automatically close blocked or human-decision issues.");
    } else {
      if (request.title) args.push("--title", request.title);
      if (request.body !== undefined) args.push("--body", request.body);
      for (const label of request.labels ?? [])
        args.push(request.action === "issue-create" ? "--label" : "--add-label", label);
    }
    await this.gh(args);
    return "Repository-scoped issue operation completed.";
  }
}
