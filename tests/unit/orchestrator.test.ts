import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AppServer,
  approvalPreview,
  prohibitedApproval
} from "../../scripts/orchestrator/app-server.js";
import { Host } from "../../scripts/orchestrator/host.js";
import {
  remoteCiTiming,
  supervise,
  waitForCi,
  withLock
} from "../../scripts/orchestrator/runner.js";
import {
  ciState,
  execution,
  operations,
  planSchema,
  selectTransport,
  validateIssue,
  validatePlan,
  type Issue,
  type Plan
} from "../../scripts/orchestrator/contracts.js";
import { Timing } from "../../scripts/orchestrator/timing.js";

export function fixturePlan(): Plan {
  return planSchema.parse({
    repository: "msoecsse/graider",
    branch: "remote-course-v2",
    expectedHead: "a".repeat(SHA_LENGTH),
    issues: [
      { number: CLOSEOUT, dependencies: [], phase: "9", audit: false },
      { number: AUDIT, dependencies: [CLOSEOUT], phase: "9", audit: true }
    ],
    requiredChecks: ["Normal checks"],
    authorization: {
      repository: "msoecsse/graider",
      branch: "remote-course-v2",
      cliFallback: true,
      operations
    }
  });
}
const SHA_LENGTH = 40;
const CLOSEOUT = 26;
const AUDIT = 15;
const TICK = 10;
const SIX_TICKS = 6;
const issue: Issue = {
  number: CLOSEOUT,
  title: "Closeout",
  body: "",
  state: "open",
  labels: ["codex:sol-high", "context:fresh"],
  dependencies: []
};
describe("orchestrator guards", () => {
  it.each([
    ["codex:luna-low", "gpt-6-luna", "low"],
    ["codex:sol-medium", "gpt-6.1-sol", "medium"],
    ["codex:sol-high", "gpt-6.1-sol", "high"]
  ])("selects %s", (label, model, effort) => {
    expect(execution({ ...issue, labels: [label, "context:fresh"] })).toEqual({ model, effort });
  });
  it("rejects ambiguous execution and nonfresh contexts", () => {
    expect(() => execution({ ...issue, labels: [...issue.labels, "codex:sol-medium"] })).toThrow();
    expect(() => execution({ ...issue, labels: ["codex:sol-high", "context:continue"] })).toThrow();
  });
  it("stops blocked issues and open dependencies", () => {
    const entry = fixturePlan().issues[0];
    if (!entry) throw new Error("Missing fixture");
    expect(() => {
      validateIssue({ ...issue, labels: [...issue.labels, "blocked"] }, entry, new Set());
    }).toThrow();
    expect(() => {
      validateIssue({ ...issue, dependencies: [AUDIT] }, entry, new Set());
    }).toThrow();
    expect(() => {
      validateIssue({ ...issue, dependencies: [AUDIT] }, entry, new Set([AUDIT]));
    }).not.toThrow();
  });
  it("stops after audits and rejects cross-phase queues", () => {
    const plan = fixturePlan();
    const [first, last] = plan.issues;
    if (!first || !last) throw new Error("Missing fixture");
    validatePlan(plan);
    first.audit = true;
    expect(() => {
      validatePlan(plan);
    }).toThrow();
    first.audit = false;
    last.phase = "10";
    expect(() => {
      validatePlan(plan);
    }).toThrow();
    expect(() => {
      validateIssue({ ...issue, title: "Phase audit" }, first, new Set());
    }).toThrow();
  });
  it.each(operations)("requires delegation for %s", (operation) => {
    const plan = fixturePlan();
    plan.authorization.operations = plan.authorization.operations.filter(
      (candidate) => candidate !== operation
    );
    expect(() => {
      validatePlan(plan);
    }).toThrow();
  });
  it("validates scope and rejects unknown config", () => {
    expect(() => planSchema.parse({ ...fixturePlan(), branch: "main" })).toThrow();
    expect(() => planSchema.parse({ ...fixturePlan(), sandbox: "disabled" })).toThrow();
  });
  it("uses verified CLI after authorized connector 403 only", async () => {
    const forbidden = {
      permissions: () => Promise.reject(Object.assign(new Error("forbidden"), { status: 403 }))
    };
    const cli = { permissions: () => Promise.resolve(true) };
    expect(await selectTransport(forbidden, cli, true)).toBe(cli);
    await expect(selectTransport(forbidden, cli, false)).rejects.toThrow();
    await expect(
      selectTransport(forbidden, { permissions: () => Promise.resolve(false) }, true)
    ).rejects.toThrow();
    await expect(
      selectTransport({ permissions: () => Promise.reject(new Error("offline")) }, cli, true)
    ).rejects.toThrow();
  });
  it("fails ambiguous/failed CI, waits for missing/pending and accepts success", () => {
    const check = {
      name: "Normal checks",
      status: "completed",
      conclusion: "success",
      started_at: null,
      completed_at: null
    };
    expect(ciState([check], [check.name])).toBe("success");
    expect(ciState([], [check.name])).toBe("pending");
    expect(ciState([{ ...check, status: "queued", conclusion: null }], [check.name])).toBe(
      "pending"
    );
    expect(() => ciState([check, check], [check.name])).toThrow();
    expect(() => ciState([{ ...check, conclusion: "cancelled" }], [check.name])).toThrow();
  });
  it("attributes overlapping intervals without double counting or silence inference", () => {
    let clock = 0;
    const timing = new Timing(
      () => clock,
      () => "fixed"
    );
    timing.start("agent", "codex");
    clock = 1 * TICK;
    timing.start("tool", "test");
    clock = 2 * TICK;
    timing.start("request", "approval");
    clock = 3 * TICK;
    timing.end("request");
    clock = 4 * TICK;
    timing.end("tool");
    clock = 5 * TICK;
    timing.end("agent");
    clock = SIX_TICKS * TICK;
    const report = timing.snapshot();
    expect(report.approvals).toEqual({ count: 1, waitsMs: [1 * TICK], longestMs: 1 * TICK });
    expect(report.exclusiveMs.test).toBe(2 * TICK);
    expect(report.exclusiveMs.codex).toBe(2 * TICK);
    expect(report.exclusiveMs.unclassified).toBe(1 * TICK);
    expect(Object.values(report.exclusiveMs).reduce((sum, value) => sum + value, 0)).toBe(
      report.totalMs
    );
  });
});

const temporaryDirectories: string[] = [];
async function temporary(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "graider-orchestrator-"));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    })
  );
});
function mockHost(cwd: string, controller = new AbortController()): Host {
  const host = new Host(fixturePlan(), cwd, controller.signal, new Timing());
  let currentHead = host.plan.expectedHead;
  const closed = new Set<number>();
  vi.spyOn(host, "permissions").mockResolvedValue(true);
  vi.spyOn(host, "guard").mockImplementation(() => Promise.resolve(currentHead));
  vi.spyOn(host, "issue").mockImplementation((number) =>
    Promise.resolve({ ...issue, number, state: closed.has(number) ? "closed" : "open" })
  );
  vi.spyOn(host, "checks").mockResolvedValue([
    {
      name: "Normal checks",
      status: "completed",
      conclusion: "success",
      started_at: null,
      completed_at: null
    }
  ]);
  vi.spyOn(host, "broker").mockResolvedValue("passed");
  vi.spyOn(host, "git").mockImplementation((args) => {
    if (args[0] === "commit") currentHead = "b".repeat(SHA_LENGTH);
    return Promise.resolve(
      args[0] === "ls-remote"
        ? `${currentHead}\trefs/heads/remote-course-v2`
        : args[0] === "status"
          ? " M example.ts"
          : ""
    );
  });
  vi.spyOn(host, "gh").mockImplementation((args) => {
    if (args[0] === "issue" && args[1] === "close") closed.add(Number(args[2]));
    return Promise.resolve("");
  });
  return host;
}
describe("orchestrator supervision and protocol", () => {
  it("verifies repository permissions and rejects uninspectable grants without exposing headers", async () => {
    const directory = await temporary();
    const runner = vi
      .fn()
      .mockResolvedValue(
        'HTTP/2.0 200 OK\r\nX-OAuth-Scopes: repo, workflow\r\n\r\n{"permissions":{"push":true},"has_issues":true,"archived":false}'
      );
    const host = new Host(
      fixturePlan(),
      directory,
      new AbortController().signal,
      new Timing(),
      runner
    );
    await expect(host.permissions()).resolves.toBe(true);
    runner.mockResolvedValue(
      'HTTP/2.0 200 OK\r\n\r\n{"permissions":{"push":true},"has_issues":true,"archived":false}'
    );
    await expect(host.permissions()).resolves.toBe(false);
    runner.mockRejectedValue(new Error("denied"));
    await expect(host.permissions()).rejects.toThrow();
  });
  it.each(["issue-create", "issue-update", "issue-label", "issue-close"] as const)(
    "delegates %s without repeated approval or shell interpretation",
    async (action) => {
      const directory = await temporary();
      const runner = vi.fn().mockResolvedValue("");
      const host = new Host(
        fixturePlan(),
        directory,
        new AbortController().signal,
        new Timing(),
        runner
      );
      vi.spyOn(host, "guard").mockResolvedValue(host.plan.expectedHead);
      vi.spyOn(host, "issue").mockResolvedValue({ ...issue, number: 1 });
      await host.broker({
        action,
        number: 1,
        title: "Literal $(shell) `text`",
        body: "Literal body",
        labels: ["codex:sol-high"]
      });
      await host.broker({
        action,
        number: 1,
        title: "Literal $(shell) `text`",
        body: "Literal body",
        labels: ["codex:sol-high"]
      });
      expect(runner).toHaveBeenCalledTimes(2);
      expect(runner.mock.calls[0]?.[0]).toBe("gh");
      expect(runner.mock.calls[0]?.[1]).toEqual(
        expect.arrayContaining(["--repo", "msoecsse/graider"])
      );
      await expect(host.broker({ action, repository: "other/repo" })).rejects.toThrow();
      host.plan.authorization.operations = [];
      await expect(host.broker({ action, number: 1 })).rejects.toThrow();
      expect(runner).toHaveBeenCalledTimes(2);
    }
  );
  it("never closes human-decision blockers through delegation", async () => {
    const directory = await temporary();
    const runner = vi.fn();
    const host = new Host(
      fixturePlan(),
      directory,
      new AbortController().signal,
      new Timing(),
      runner
    );
    vi.spyOn(host, "guard").mockResolvedValue(host.plan.expectedHead);
    vi.spyOn(host, "issue").mockResolvedValue({ ...issue, labels: ["needs-human-decision"] });
    await expect(host.broker({ action: "issue-close", number: 1 })).rejects.toThrow();
    expect(runner).not.toHaveBeenCalled();
  });
  it("reports remote CI unions separately and marks queue timing unavailable", () => {
    const check = {
      name: "test",
      status: "completed",
      conclusion: "success",
      started_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:00:01Z"
    };
    expect(remoteCiTiming([check, check])).toMatchObject({
      queueMs: null,
      executionUnionMs: ONE_SECOND_MS
    });
    expect(remoteCiTiming([{ ...check, started_at: null }]).executionUnionMs).toBeNull();
  });
  it("serially validates, commits, pushes, verifies CI and closes before next issue; resumes completed prefix", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    const calls: number[] = [];
    const agent = {
      run: (value: Issue) => {
        calls.push(value.number);
        if (value.number === AUDIT)
          expect(vi.spyOn(host, "gh")).toHaveBeenCalledWith(
            expect.arrayContaining(["close", String(CLOSEOUT)])
          );
        return Promise.resolve();
      }
    };
    await supervise(host, agent, directory, false, false, () => {});
    expect(calls).toEqual([CLOSEOUT, AUDIT]);
    await supervise(host, agent, directory, true, false, () => {});
    expect(calls).toEqual([CLOSEOUT, AUDIT]);
  });
  it("dry run launches no agent or mutation", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    const run = vi.fn();
    await supervise(host, { run }, directory, false, true, () => {});
    expect(run).not.toHaveBeenCalled();
    expect(vi.spyOn(host, "git")).toHaveBeenCalledWith(expect.arrayContaining(["ls-remote"]));
    expect(vi.spyOn(host, "gh")).not.toHaveBeenCalled();
  });
  it("does not retry interrupted implementation", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    const run = vi.fn().mockRejectedValue(new Error("interrupted"));
    await expect(supervise(host, { run }, directory, false, false, () => {})).rejects.toThrow();
    await expect(supervise(host, { run }, directory, true, false, () => {})).rejects.toThrow(
      "manual recovery"
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("stops on unexpected HEAD changes", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    vi.spyOn(host, "guard").mockResolvedValue("c".repeat(SHA_LENGTH));
    const run = vi.fn();
    await expect(supervise(host, { run }, directory, false, false, () => {})).rejects.toThrow(
      "HEAD"
    );
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects dirty worktrees or unexpected branches before launch", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    vi.spyOn(host, "guard").mockRejectedValue(new Error("Unexpected branch or dirty worktree"));
    const run = vi.fn();
    await expect(supervise(host, { run }, directory, false, false, () => {})).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it("stops queue before implementation for blocked labels or denied permissions", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    const run = vi.fn();
    vi.spyOn(host, "permissions").mockResolvedValue(false);
    await expect(supervise(host, { run }, directory, false, false, () => {})).rejects.toThrow();
    vi.spyOn(host, "permissions").mockResolvedValue(true);
    vi.spyOn(host, "issue").mockResolvedValue({ ...issue, labels: [...issue.labels, "blocked"] });
    await expect(supervise(host, { run }, directory, false, false, () => {})).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it("holds an exclusive lock and preserves failed locks for recovery", async () => {
    const directory = await temporary();
    const file = path.join(directory, "lock");
    await withLock(file, async () => {
      await expect(withLock(file, () => Promise.resolve())).rejects.toThrow();
    });
    await expect(withLock(file, () => Promise.reject(new Error("failed")))).rejects.toThrow();
    await expect(withLock(file, () => Promise.resolve())).rejects.toThrow();
  });
  it("polls pending CI, observes cancellation and never accepts failure", async () => {
    const host = mockHost(await temporary());
    const success = await host.checks("sha");
    vi.spyOn(host, "checks").mockResolvedValueOnce([]).mockResolvedValue(success);
    await expect(
      waitForCi(
        host,
        "sha",
        () => {},
        () => Promise.resolve()
      )
    ).resolves.toEqual(success);
    vi.spyOn(host, "checks").mockResolvedValue([
      {
        name: "Normal checks",
        status: "completed",
        conclusion: "failure",
        started_at: null,
        completed_at: null
      }
    ]);
    await expect(waitForCi(host, "sha", () => {})).rejects.toThrow();
    const controller = new AbortController();
    const cancelled = mockHost(host.cwd, controller);
    vi.spyOn(cancelled, "checks").mockResolvedValue([]);
    controller.abort();
    await expect(waitForCi(cancelled, "sha", () => {})).rejects.toThrow();
  });
  it("starts separate processes and fresh threads using argument arrays in paths with spaces", async () => {
    const directory = await temporary();
    const log = path.join(directory, "protocol with spaces.jsonl");
    const host = mockHost(directory);
    const fixture = fileURLToPath(new URL("../fixtures/orchestrator-server.ts", import.meta.url));
    const agent = new AppServer(
      process.execPath,
      () => Promise.resolve(false),
      () => {},
      [
        "--import",
        new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href,
        fixture,
        "ready",
        log
      ]
    );
    await agent.run(issue, host);
    await agent.run(issue, host);
    const records = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { method?: string; pid: number });
    expect(new Set(records.map((record) => record.pid)).size).toBe(2);
    expect(records.filter((record) => record.method === "thread/start")).toHaveLength(2);
    expect(records.some((record) => record.method === "thread/resume")).toBe(false);
  });
  it.each(["approval", "human", "blocked", "cancel"])(
    "handles %s without advancing or accepting human decisions",
    async (scenario) => {
      const directory = await temporary();
      const controller = new AbortController();
      const host = mockHost(directory, controller);
      const agent = new AppServer(
        process.execPath,
        () => {
          if (scenario === "approval") controller.abort();
          return Promise.resolve(false);
        },
        (stage) => {
          if (scenario === "cancel" && stage === "starting fresh Codex context")
            setTimeout(() => {
              controller.abort();
            }, RPC_TEST_CANCEL_MS);
        },
        [
          "--import",
          new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href,
          fileURLToPath(new URL("../fixtures/orchestrator-server.ts", import.meta.url)),
          scenario
        ]
      );
      await expect(agent.run(issue, host)).rejects.toThrow();
      expect(vi.spyOn(host, "git")).not.toHaveBeenCalled();
      if (scenario === "approval") expect(host.timing.snapshot().approvals.count).toBe(1);
      if (scenario === "human") expect(host.timing.snapshot().approvals.count).toBe(0);
    }
  );
  it("redacts credential previews and rejects dangerous approvals", () => {
    vi.stubEnv("GITHUB_TOKEN", "fake-sensitive-value");
    expect(
      approvalPreview({ command: "echo fake-sensitive-value ghp_fakecredential" })
    ).not.toContain("fake-sensitive-value");
    expect(approvalPreview({ command: "echo ghp_fakecredential" })).not.toContain(
      "ghp_fakecredential"
    );
    expect(prohibitedApproval({ command: "git push --force" })).toBe(true);
    expect(prohibitedApproval({ command: "rm -rf directory" })).toBe(true);
    vi.unstubAllEnvs();
  });
  it("does not accept a forged recovery checkpoint", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    await writeFile(
      path.join(directory, "checkpoint.json"),
      JSON.stringify({
        fingerprint: "wrong",
        head: host.plan.expectedHead,
        completed: [],
        inProgress: null
      })
    );
    await expect(
      supervise(host, { run: vi.fn() }, directory, true, false, () => {})
    ).rejects.toThrow();
  });
});
const RPC_TEST_CANCEL_MS = 500;
const ONE_SECOND_MS = 1000;
