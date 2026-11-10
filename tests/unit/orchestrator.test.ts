import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import {
  TerminalApprovals,
  type Approval,
  type ApprovalDecision
} from "../../scripts/orchestrator/approvals.js";
import {
  AppServer,
  AppServerProtocol,
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
function mockHost(cwd: string, controller = new AbortController(), timing = new Timing()): Host {
  const host = new Host(fixturePlan(), cwd, controller.signal, timing);
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
      assertIsolation: () => {},
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
    await supervise(host, { assertIsolation: () => {}, run }, directory, false, true, () => {});
    expect(run).not.toHaveBeenCalled();
    expect(vi.spyOn(host, "git")).toHaveBeenCalledWith(expect.arrayContaining(["ls-remote"]));
    expect(vi.spyOn(host, "gh")).not.toHaveBeenCalled();
  });
  it("does not retry interrupted implementation", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    const run = vi.fn().mockRejectedValue(new Error("interrupted"));
    await expect(
      supervise(host, { assertIsolation: () => {}, run }, directory, false, false, () => {})
    ).rejects.toThrow();
    await expect(
      supervise(host, { assertIsolation: () => {}, run }, directory, true, false, () => {})
    ).rejects.toThrow("manual recovery");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("stops on unexpected HEAD changes", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    vi.spyOn(host, "guard").mockResolvedValue("c".repeat(SHA_LENGTH));
    const run = vi.fn();
    await expect(
      supervise(host, { assertIsolation: () => {}, run }, directory, false, false, () => {})
    ).rejects.toThrow("HEAD");
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects dirty worktrees or unexpected branches before launch", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    vi.spyOn(host, "guard").mockRejectedValue(new Error("Unexpected branch or dirty worktree"));
    const run = vi.fn();
    await expect(
      supervise(host, { assertIsolation: () => {}, run }, directory, false, false, () => {})
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it("stops queue before implementation for blocked labels or denied permissions", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    const run = vi.fn();
    vi.spyOn(host, "permissions").mockResolvedValue(false);
    await expect(
      supervise(host, { assertIsolation: () => {}, run }, directory, false, false, () => {})
    ).rejects.toThrow();
    vi.spyOn(host, "permissions").mockResolvedValue(true);
    vi.spyOn(host, "issue").mockResolvedValue({ ...issue, labels: [...issue.labels, "blocked"] });
    await expect(
      supervise(host, { assertIsolation: () => {}, run }, directory, false, false, () => {})
    ).rejects.toThrow();
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
    const agent = new AppServerProtocol(
      process.execPath,
      () => Promise.resolve("denied"),
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
      const agent = new AppServerProtocol(
        process.execPath,
        () => {
          if (scenario === "approval") controller.abort();
          return Promise.resolve("denied");
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
      supervise(host, { assertIsolation: () => {}, run: vi.fn() }, directory, true, false, () => {})
    ).rejects.toThrow();
  });
});
const RPC_TEST_CANCEL_MS = 500;
const ONE_SECOND_MS = 1000;

function fixtureArguments(scenario: string, log?: string): string[] {
  return [
    "--import",
    new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href,
    fileURLToPath(new URL("../fixtures/orchestrator-server.ts", import.meta.url)),
    scenario,
    ...(log ? [log] : [])
  ];
}
function protocolAgent(scenario: string, approval: Approval, log?: string): AppServerProtocol {
  return new AppServerProtocol(
    process.execPath,
    approval,
    () => {},
    fixtureArguments(scenario, log)
  );
}

describe("approval lifecycle regressions", () => {
  it("cancels an outstanding startup RPC without waiting for its timeout or starting a turn", async () => {
    const controller = new AbortController();
    const directory = await temporary();
    const log = path.join(directory, "setup-protocol.jsonl");
    let now = 0;
    const host = mockHost(directory, controller, new Timing(() => now));
    const result = protocolAgent("cancel-setup", vi.fn(), log).run(issue, host);
    const rejected = expect(result).rejects.toThrow("Execution cancelled");
    await vi.waitFor(() => {
      expect(host.timing.events.some((event) => event.id === "item:setup-wait")).toBe(true);
    });
    now = TICK;
    controller.abort();
    await rejected;
    now += TICK;
    expect(
      host.timing.snapshot().intervals.find((interval) => interval.id === "item:setup-wait")
    ).toMatchObject({ start: 0, end: TICK });
    const protocol = await readFile(log, "utf8");
    expect(protocol).not.toContain("thread/start");
    expect(protocol).not.toContain("turn/start");
  });
  it("preserves prohibition over later tool, turn and transport failures without a prompt", async () => {
    const directory = await temporary();
    const approval = vi.fn<Approval>();
    const progress = vi.fn();
    const host = mockHost(directory);
    const agent = new AppServerProtocol(process.execPath, approval, progress, [
      "--import",
      new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href,
      fileURLToPath(new URL("../fixtures/orchestrator-server.ts", import.meta.url)),
      "prohibited"
    ]);
    await expect(agent.run(issue, host)).rejects.toThrow("Prohibited operation");
    expect(approval).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalledWith("awaiting human approval");
    expect(host.timing.snapshot().approvals.count).toBe(1);
  });

  it.each([
    ["denied", "explicitly denied"],
    ["unavailable", "Interactive authorization unavailable"],
    ["cancelled", "Authorization cancelled"],
    ["invalid", "must be yes or no"]
  ] as const)("retains the distinct %s reason", async (decision, reason) => {
    const host = mockHost(await temporary());
    await expect(
      protocolAgent("approval", () => Promise.resolve(decision)).run(issue, host)
    ).rejects.toThrow(reason);
  });

  it("redacts callback errors and closes their timing interval", async () => {
    const host = mockHost(await temporary());
    const result = protocolAgent("approval", () => {
      throw new Error("fake-secret-not-for-output");
    }).run(issue, host);
    await expect(result).rejects.toThrow("Authorization input failed; raw diagnostics withheld.");
    expect(host.timing.events.filter((event) => event.id === "approval:approval")).toHaveLength(2);
  });

  it("accepts successive routine command and file approvals with one decision per request", async () => {
    const host = mockHost(await temporary());
    const approval = vi.fn<Approval>().mockResolvedValue("accepted");
    await protocolAgent("successive", approval).run(issue, host);
    expect(approval.mock.calls.map(([method, id]) => [method, id])).toEqual([
      ["item/commandExecution/requestApproval", "first"],
      ["item/fileChange/requestApproval", "second"]
    ]);
    expect(host.timing.snapshot().approvals.count).toBe(2);
  });

  it("serializes concurrent prompts and retains queued wait and exclusive wall time", async () => {
    let now = 0;
    const timing = new Timing(() => now);
    const host = mockHost(await temporary(), new AbortController(), timing);
    let active = 0;
    const approval = vi.fn<Approval>().mockImplementation(async (_method, id) => {
      active += 1;
      expect(active).toBe(1);
      await vi.waitFor(() => {
        expect(timing.snapshot().approvals.count).toBe(2);
      });
      now += TICK;
      active -= 1;
      expect(id).toBe(approval.mock.calls.length === 1 ? "first" : "second");
      return "accepted";
    });
    await protocolAgent("concurrent", approval).run(issue, host);
    expect(approval).toHaveBeenCalledTimes(2);
    const report = timing.snapshot();
    expect(report.approvals).toEqual({ count: 2, waitsMs: [TICK, 2 * TICK], longestMs: 2 * TICK });
    expect(report.exclusiveMs.approval).toBe(2 * TICK);
    expect(Object.values(report.exclusiveMs).reduce((sum, value) => sum + value, 0)).toBe(
      report.totalMs
    );
  });

  it("never displays queued prompts after denial", async () => {
    const host = mockHost(await temporary());
    const approval = vi.fn<Approval>().mockImplementation(async () => {
      await vi.waitFor(() => {
        expect(host.timing.snapshot().approvals.count).toBe(2);
      });
      return "denied";
    });
    await expect(protocolAgent("concurrent", approval).run(issue, host)).rejects.toThrow(
      "explicitly denied"
    );
    expect(approval).toHaveBeenCalledTimes(1);
    expect(host.timing.snapshot().approvals.count).toBe(2);
    expect(
      host.timing.events.filter((event) => event.type === "end" && event.id.startsWith("approval:"))
    ).toHaveLength(2);
  });

  it("cancels active and queued requests even if the callback ignores its signal", async () => {
    const controller = new AbortController();
    const host = mockHost(await temporary(), controller);
    const approval = vi.fn<Approval>().mockImplementation(async () => {
      await vi.waitFor(() => {
        expect(host.timing.snapshot().approvals.count).toBe(2);
      });
      controller.abort();
      return new Promise<ApprovalDecision>(() => {});
    });
    await expect(protocolAgent("concurrent", approval).run(issue, host)).rejects.toThrow(
      "Execution cancelled"
    );
    expect(approval).toHaveBeenCalledTimes(1);
    expect(
      host.timing.events.filter((event) => event.type === "end" && event.id.startsWith("approval:"))
    ).toHaveLength(2);
  });

  it.each([
    ["resolved", "resolved before a local decision"],
    ["unresolved", "ended with unresolved authorization"],
    ["human", "unsupported authorization"]
  ])("fails closed on %s instead of offering a late grant", async (scenario, reason) => {
    const host = mockHost(await temporary());
    const approval = vi.fn<Approval>().mockImplementation(() => new Promise(() => {}));
    await expect(protocolAgent(scenario, approval).run(issue, host)).rejects.toThrow(reason);
  });

  it("rejects a pre-cancelled run before thread startup", async () => {
    const controller = new AbortController();
    controller.abort();
    const directory = await temporary();
    const log = path.join(directory, "protocol.jsonl");
    await expect(
      protocolAgent("ready", vi.fn(), log).run(issue, mockHost(directory, controller))
    ).rejects.toThrow("Execution cancelled");
    // The fixture may start, but receives no initialize/thread/turn request.
    await expect(readFile(log)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("terminal approval input", () => {
  function terminalFixture(interactive = true): {
    input: PassThrough;
    output: PassThrough;
    terminal: TerminalApprovals;
    prompts: string[];
  } {
    const input = Object.assign(new PassThrough(), { isTTY: interactive });
    const output = new PassThrough();
    const prompts: string[] = [];
    output.on("data", (data: Buffer) => prompts.push(data.toString()));
    return { input, output, terminal: new TerminalApprovals(input, output), prompts };
  }
  it("keeps successive and concurrent questions serialized on one terminal", async () => {
    const { input, terminal, prompts } = terminalFixture();
    try {
      const signal = new AbortController().signal;
      const first = terminal.request("command", "first", signal, "preview");
      const second = terminal.request("file", "second", signal, "preview");
      await vi.waitFor(() => {
        expect(prompts).toHaveLength(1);
      });
      input.write("yes\nyes\n");
      await expect(first).resolves.toBe("accepted");
      await vi.waitFor(() => {
        expect(prompts).toHaveLength(2);
      });
      input.write("no\n");
      await expect(second).resolves.toBe("denied");
      const third = terminal.request("command", "third", signal, "preview");
      await vi.waitFor(() => {
        expect(prompts).toHaveLength(3);
      });
      input.write("yes\n");
      await expect(third).resolves.toBe("accepted");
    } finally {
      terminal.close();
    }
  });
  it("reports noninteractive input without a prompt", async () => {
    const { terminal, prompts } = terminalFixture(false);
    await expect(terminal.request("command", "id", new AbortController().signal, "")).resolves.toBe(
      "unavailable"
    );
    expect(prompts).toEqual([]);
    terminal.close();
  });
  it.each(["eof", "cancel", "invalid", "error"])(
    "handles %s while awaiting input",
    async (scenario) => {
      const { input, terminal, prompts } = terminalFixture();
      const controller = new AbortController();
      try {
        const answer = terminal.request("command", "id", controller.signal, "");
        await vi.waitFor(() => {
          expect(prompts).toHaveLength(1);
        });
        if (scenario === "cancel") controller.abort();
        else if (scenario === "invalid") input.write("maybe\n");
        else if (scenario === "error") input.emit("error", new Error("fake input error"));
        else input.end();
        await expect(answer).resolves.toBe(
          scenario === "cancel" ? "cancelled" : scenario === "invalid" ? "invalid" : "unavailable"
        );
        if (scenario === "eof")
          await expect(terminal.request("command", "next", controller.signal, "")).resolves.toBe(
            "unavailable"
          );
      } finally {
        terminal.close();
      }
    }
  );
});

describe("unverified isolation execution gate", () => {
  it.each(["preflight", "run"] as const)(
    "blocks direct Agent.%s calls before process startup",
    async (method) => {
      const directory = await temporary();
      const canary = path.join(directory, "protected-canary");
      await writeFile(canary, "supervisor-owned");
      const agent = new AppServer(
        process.execPath,
        vi.fn(),
        () => {},
        fixtureArguments("hostile-native-edit", canary)
      );
      const host = mockHost(directory);
      const result = method === "run" ? agent.run(issue, host) : agent.preflight([issue], host);
      await expect(result).rejects.toThrow("Issue execution disabled");
      expect(await readFile(canary, "utf8")).toBe("supervisor-owned");
    }
  );
  it("CLI rejects execution before reading a plan or overwriting existing invocation evidence", async () => {
    const directory = await temporary();
    const invocation = path.join(directory, "invocation.json");
    await writeFile(invocation, "preserved failed-run evidence");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href,
        fileURLToPath(new URL("../../scripts/orchestrator/index.ts", import.meta.url)),
        "--execute",
        "--resume",
        "--plan",
        path.join(directory, "absent-plan.json"),
        "--state",
        directory
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Issue execution disabled");
    expect(await readFile(invocation, "utf8")).toBe("preserved failed-run evidence");
  });
  it.each([false, true])(
    "blocks hostile native editing before startup, including resume=%s",
    async (resume) => {
      const directory = await temporary();
      const canary = path.join(directory, "protected-native-edit-canary");
      const checkpoint = path.join(directory, "checkpoint.json");
      await writeFile(canary, "supervisor-owned");
      await writeFile(checkpoint, "interrupted evidence; never replay");
      const host = mockHost(directory);
      const agent = new AppServer(
        process.execPath,
        vi.fn(),
        () => {},
        fixtureArguments("hostile-native-edit", canary)
      );
      const run = vi.spyOn(agent, "run");
      await expect(supervise(host, agent, directory, resume, false, () => {})).rejects.toThrow(
        "Issue execution disabled"
      );
      expect(run).not.toHaveBeenCalled();
      expect(await readFile(canary, "utf8")).toBe("supervisor-owned");
      expect(await readFile(checkpoint, "utf8")).toBe("interrupted evidence; never replay");
      for (const method of ["permissions", "guard", "broker", "gh", "git"] as const)
        expect(vi.spyOn(host, method)).not.toHaveBeenCalled();
    }
  );
  it("retains read-only dry-run inspection without starting an agent or host validation", async () => {
    const directory = await temporary();
    const host = mockHost(directory);
    const agent = new AppServer(
      process.execPath,
      vi.fn(),
      () => {},
      fixtureArguments("hostile-native-edit")
    );
    const run = vi.spyOn(agent, "run");
    await supervise(host, agent, directory, false, true, () => {});
    expect(run).not.toHaveBeenCalled();
    expect(vi.spyOn(host, "broker")).not.toHaveBeenCalled();
    expect(vi.spyOn(host, "gh")).not.toHaveBeenCalled();
  });
});
