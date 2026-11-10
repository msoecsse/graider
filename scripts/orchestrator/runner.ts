import { StopError } from "./errors.js";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  ciState,
  execution,
  selectTransport,
  validateIssue,
  validatePlan,
  type Check,
  type Issue,
  type Plan
} from "./contracts.js";
import type { Agent } from "./app-server.js";
import { Host } from "./host.js";

const POLL_MS = 10_000;
const CI_TIMEOUT_MS = 3_600_000;
export function remoteCiTiming(checks: Check[]): {
  queueMs: null;
  executionUnionMs: number | null;
  reason: string;
} {
  const ranges = checks.map((check) => ({
    start: Date.parse(check.started_at ?? ""),
    end: Date.parse(check.completed_at ?? "")
  }));
  let executionUnionMs: number | null = null;
  if (
    ranges.length > 0 &&
    ranges.every(
      (range) =>
        Number.isFinite(range.start) && Number.isFinite(range.end) && range.end >= range.start
    )
  ) {
    const sorted = ranges.sort((left, right) => left.start - right.start);
    let end = 0;
    executionUnionMs = 0;
    for (const range of sorted) {
      executionUnionMs += Math.max(0, range.end - Math.max(range.start, end));
      end = Math.max(end, range.end);
    }
  }
  return {
    queueMs: null,
    executionUnionMs,
    reason:
      "Queue entry timestamps unavailable from check-runs. Execution is the union of remote check start/end intervals, reported separately from local wall time."
  };
}
const checkpointSchema = z
  .object({
    fingerprint: z.string(),
    head: z.string(),
    completed: z.array(z.number()),
    inProgress: z.number().nullable()
  })
  .strict();
type Checkpoint = z.infer<typeof checkpointSchema>;
export interface SupervisorHost {
  readonly plan: Plan;
  readonly cwd: string;
  readonly signal: AbortSignal;
  readonly timing: Host["timing"];
  guard(clean: boolean): Promise<string>;
  permissions(): Promise<boolean>;
  git(args: string[]): Promise<string>;
  issue(number: number): Promise<Issue>;
  checks(sha: string): Promise<Check[]>;
  gh(args: string[]): Promise<string>;
  broker(input: unknown): Promise<string>;
}
export async function verifyIssue(
  host: SupervisorHost,
  entry: Plan["issues"][number]
): Promise<Issue> {
  const issue = await host.issue(entry.number);
  const dependencies = [...new Set([...entry.dependencies, ...issue.dependencies])];
  const closed = new Set<number>();
  for (const number of dependencies) {
    if ((await host.issue(number)).state.toLowerCase() === "closed") closed.add(number);
  }
  validateIssue(issue, entry, closed);
  return issue;
}
export async function waitForCi(
  host: SupervisorHost,
  sha: string,
  progress: (stage: string) => void,
  sleep: (ms: number, signal: AbortSignal) => Promise<void> = async (ms, signal) => {
    await delay(ms, undefined, { signal });
  }
): Promise<Check[]> {
  const started = performance.now();
  let checks = await host.checks(sha);
  host.timing.start("ci", "ci-wait");
  try {
    let status = ciState(checks, host.plan.requiredChecks);
    while (status === "pending" && performance.now() - started < CI_TIMEOUT_MS) {
      host.signal.throwIfAborted();
      progress("waiting for required CI");
      await sleep(POLL_MS, host.signal);
      await host.guard(true);
      checks = await host.checks(sha);
      status = ciState(checks, host.plan.requiredChecks);
    }
    if (status !== "success") throw new StopError("Required CI timed out or is missing.");
    return checks.filter((check) => host.plan.requiredChecks.includes(check.name));
  } finally {
    host.timing.end("ci");
  }
}
export async function supervise(
  host: Host,
  agent: Agent,
  stateDirectory: string,
  resume: boolean,
  dryRun: boolean,
  progress: (stage: string) => void
): Promise<void> {
  validatePlan(host.plan);
  await selectTransport(undefined, host, host.plan.authorization.cliFallback);
  const initialHead = await host.guard(true);
  const remoteHead = (
    await host.git(["ls-remote", "--exit-code", "origin", `refs/heads/${host.plan.branch}`])
  ).split(/\s+/)[0];
  if (remoteHead !== initialHead)
    throw new StopError("Development branch differs from remote HEAD.");
  const fingerprint = createHash("sha256").update(JSON.stringify(host.plan)).digest("hex");
  const stateFile = path.join(stateDirectory, "checkpoint.json");
  let state: Checkpoint = {
    fingerprint,
    head: host.plan.expectedHead,
    completed: [],
    inProgress: null
  };
  if (resume) {
    state = checkpointSchema.parse(JSON.parse(await readFile(stateFile, "utf8")) as unknown);
    if (
      state.fingerprint !== fingerprint ||
      state.inProgress !== null ||
      state.completed.some((number, index) => host.plan.issues[index]?.number !== number)
    )
      throw new StopError(
        "Interrupted or incompatible checkpoint: manual recovery required; no automatic retry."
      );
  }
  if (initialHead !== state.head)
    throw new StopError("Unexpected HEAD; review plan/checkpoint before execution.");
  for (const number of state.completed) {
    if ((await host.issue(number)).state.toLowerCase() !== "closed")
      throw new StopError("Completed issue reopened.");
  }
  const remaining = host.plan.issues.slice(state.completed.length);
  const queuedIssues: Issue[] = [];
  // Preflight the whole queue before any implementation. Queue predecessors may satisfy dependencies later,
  // but a blocked label must be legitimately removed by a human before launch.
  for (const entry of remaining) {
    const issue = await host.issue(entry.number);
    queuedIssues.push(issue);
    execution(issue);
    if (
      issue.state.toLowerCase() !== "open" ||
      issue.labels.some((label) => /blocked|needs-human-decision/i.test(label))
    )
      throw new StopError(`Issue #${String(entry.number)} is not runnable.`);
    const predecessors = new Set(
      host.plan.issues
        .slice(0, host.plan.issues.indexOf(entry))
        .map((candidate) => candidate.number)
    );
    for (const dependency of [...new Set([...entry.dependencies, ...issue.dependencies])]) {
      if (
        !predecessors.has(dependency) &&
        (await host.issue(dependency)).state.toLowerCase() !== "closed"
      )
        throw new StopError("Unresolved external dependency.");
    }
    progress(
      `#${String(entry.number)}: ${JSON.stringify(execution(issue))}${entry.audit ? "; stop after audit" : ""}`
    );
  }
  if (dryRun) {
    progress("dry-run complete; no agent or mutation started");
  } else {
    await agent.preflight?.(queuedIssues, host);
    await mkdir(stateDirectory, { recursive: true });
    if (!resume) {
      const file = await open(stateFile, "wx");
      await file.writeFile(JSON.stringify(state));
      await file.close();
    }
    const save = async (): Promise<void> => {
      const temp = `${stateFile}.tmp`;
      await writeFile(temp, JSON.stringify(state, null, 2));
      await rename(temp, stateFile);
    };
    let issueStart = host.timing.snapshot().totalMs;
    try {
      for (const entry of remaining) {
        host.signal.throwIfAborted();
        progress(`#${String(entry.number)}: validating`);
        const head = await host.guard(true);
        if (head !== state.head) throw new StopError("HEAD changed between issues.");
        const issue = await verifyIssue(host, entry);
        state.inProgress = entry.number;
        await save();
        const reportStart = host.timing.snapshot().totalMs;
        issueStart = reportStart;
        await agent.run(issue, host);
        if ((await host.guard(false)) !== head)
          throw new StopError("Agent changed HEAD; supervisor owns commits.");
        await verifyIssue(host, entry);
        progress(`#${String(entry.number)}: required local validation`);
        for (const validation of ["typecheck", "lint", "format:check", "test", "build"])
          await host.broker({ action: "validate", validation });
        if (JSON.stringify(await verifyIssue(host, entry)) !== JSON.stringify(issue))
          throw new StopError("Issue requirements changed during implementation.");
        if (!(await host.git(["status", "--porcelain=v1", "--untracked-files=all"])).trim())
          throw new StopError("No implementation changes to commit.");
        await host.git(["add", "--all"]);
        await host.git(["commit", "-m", `Implement #${String(entry.number)}: ${issue.title}`]);
        const sha = await host.guard(true);
        progress(`#${String(entry.number)}: pushing ${sha}`);
        await host.git(["push", "origin", `HEAD:refs/heads/${host.plan.branch}`]);
        const remote = await host.git([
          "ls-remote",
          "--exit-code",
          "origin",
          `refs/heads/${host.plan.branch}`
        ]);
        if (remote.split(/\s+/)[0] !== sha)
          throw new StopError("Pushed SHA could not be verified.");
        const checks = await waitForCi(host, sha, progress);
        if ((await host.guard(true)) !== sha) throw new StopError("HEAD changed during CI.");
        if (JSON.stringify(await verifyIssue(host, entry)) !== JSON.stringify(issue))
          throw new StopError("Issue requirements changed during CI.");
        await host.gh([
          "issue",
          "close",
          String(entry.number),
          "--repo",
          host.plan.repository,
          "--comment",
          `Implemented in ${sha}. Required local validation and configured CI checks passed. Orchestrator report records timing and checks.`
        ]);
        if ((await host.issue(entry.number)).state.toLowerCase() !== "closed")
          throw new StopError("Issue closure could not be verified.");
        state = {
          ...state,
          head: sha,
          completed: [...state.completed, entry.number],
          inProgress: null
        };
        await save();
        const report = {
          issue: entry.number,
          sha,
          startedElapsedMs: reportStart,
          endedElapsedMs: host.timing.snapshot().totalMs,
          checks,
          timing: host.timing.snapshot(reportStart),
          ciTiming: remoteCiTiming(checks)
        };
        await writeFile(
          path.join(stateDirectory, `issue-${String(entry.number)}.json`),
          JSON.stringify(report, null, 2)
        );
        await writeFile(
          path.join(stateDirectory, `issue-${String(entry.number)}.txt`),
          `Issue #${String(entry.number)}\nCommit ${sha}\nCompleted; pushed; issue closed; required CI green.\nIssue wall time: ${String(report.endedElapsedMs - report.startedElapsedMs)}ms\nCI: ${JSON.stringify(report.ciTiming)}\nExclusive timing: ${JSON.stringify(report.timing.exclusiveMs)}\nApprovals: ${JSON.stringify(report.timing.approvals)}\n`
        );
        if (entry.audit) progress("phase audit complete; stopped at phase boundary");
      }
    } finally {
      if (state.inProgress !== null) {
        const report = {
          issue: state.inProgress,
          status: "stopped; manual recovery required",
          timing: host.timing.snapshot(issueStart)
        };
        await writeFile(
          path.join(stateDirectory, `issue-${String(state.inProgress)}.json`),
          JSON.stringify(report, null, 2)
        );
        await writeFile(
          path.join(stateDirectory, `issue-${String(state.inProgress)}.txt`),
          `Issue stopped; manual recovery required.\n${JSON.stringify(report, null, 2)}\n`
        );
      }
      const timing = host.timing.snapshot();
      await writeFile(path.join(stateDirectory, "timing.json"), JSON.stringify(timing, null, 2));
      await writeFile(
        path.join(stateDirectory, "report.txt"),
        `Completed issues: ${state.completed.join(", ")}\nIn progress: ${String(state.inProgress ?? "none")}\nWall time: ${String(timing.totalMs)}ms\nExclusive categories: ${JSON.stringify(timing.exclusiveMs)}\nApproval requests/waits: ${JSON.stringify(timing.approvals)}\nAgent raw output is not logged. Unidentifiable tool subprocesses are unattributed.\n`
      );
    }
  }
}

export async function withLock<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const handle = await open(file, "wx");
  await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  let succeeded = false;
  try {
    const result = await operation();
    succeeded = true;
    return result;
  } finally {
    await handle.close();
    // A failed/interrupted run may still have a child winding down. Preserve the lock for manual review.
    if (succeeded) await unlink(file);
  }
}
