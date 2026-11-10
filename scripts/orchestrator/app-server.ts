import { StopError } from "./errors.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";
import { execution, type Issue } from "./contracts.js";
import { brokerSchema, type Host } from "./host.js";
import { commandCategory, type Timing } from "./timing.js";

const RPC_TIMEOUT_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const MAX_LINE_BYTES = 10_485_760;
const object = z.record(z.string(), z.unknown());
const messageSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: object.optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional()
});
export type Approval = (
  method: string,
  id: string,
  signal: AbortSignal,
  preview: string
) => Promise<boolean>;
export function approvalPreview(params: Record<string, unknown>): string {
  let preview = JSON.stringify({
    command: params.command,
    cwd: params.cwd,
    reason: params.reason,
    grantRoot: params.grantRoot
  });
  for (const [key, value] of Object.entries(process.env)) {
    if (/token|secret|password|authorization|api.?key/i.test(key) && value)
      preview = preview.split(value).join("[REDACTED]");
  }
  return preview.replace(
    /(?:gh[pousr]_[a-zA-Z0-9_]+|github_pat_[a-zA-Z0-9_]+|sk-[a-zA-Z0-9_-]+|Bearer\s+[^\s"\\]+)/gi,
    "[REDACTED]"
  );
}
export function prohibitedApproval(params: Record<string, unknown>): boolean {
  const command = typeof params.command === "string" ? params.command : "";
  return (
    params.kind === "stdin" ||
    /(?:\brm\b|\brmdir\b|\bRemove-Item\b|\breset\b|\bclean\b|\bforce\b|--force|-f\b|\bdanger-full-access\b|\bno-sandbox\b|\bgit\s+.*\b(?:checkout|switch|branch|worktree)\b)/i.test(
      command
    )
  );
}
export interface Agent {
  run(issue: Issue, host: Host): Promise<void>;
  preflight?(issues: Issue[], host: Host): Promise<void>;
}
export class AppServer implements Agent {
  constructor(
    private readonly executable: string,
    private readonly approval: Approval,
    private readonly progress: (stage: string) => void,
    private readonly arguments_: string[] = ["app-server"]
  ) {}
  async preflight(issues: Issue[], host: Host): Promise<void> {
    const child = spawn(this.executable, this.arguments_, {
      cwd: host.cwd,
      shell: false,
      windowsHide: true,
      stdio: "pipe"
    });
    const rpc = new Rpc(child, host.timing, this.progress);
    try {
      await rpc.request("initialize", {
        clientInfo: { name: "graider_serial_orchestrator", version: "1.0.0" },
        capabilities: { experimentalApi: true }
      });
      rpc.notify("initialized", {});
      const account = object.parse(await rpc.request("account/read", {}));
      if (!account.account) throw new StopError("Codex authentication unavailable.");
      const catalog = z
        .object({
          data: z.array(
            z.object({
              id: z.string(),
              supportedReasoningEfforts: z.array(z.object({ reasoningEffort: z.string() }))
            })
          )
        })
        .parse(await rpc.request("model/list", { limit: 100 }));
      for (const issue of issues) {
        const selection = execution(issue);
        if (
          !catalog.data.some(
            (model) =>
              model.id === selection.model &&
              model.supportedReasoningEfforts.some(
                (effort) => effort.reasoningEffort === selection.effort
              )
          )
        )
          throw new StopError("Queue model or effort unavailable.");
      }
      if (process.platform === "win32") {
        const readiness = z
          .object({ status: z.literal("ready") })
          .safeParse(await rpc.request("windowsSandbox/readiness", {}));
        if (!readiness.success) throw new StopError("Windows sandbox requires operator setup.");
      }
    } finally {
      await rpc.close();
    }
  }
  async run(issue: Issue, host: Host): Promise<void> {
    const child = spawn(this.executable, this.arguments_, {
      cwd: host.cwd,
      shell: false,
      windowsHide: true,
      stdio: "pipe"
    });
    const rpc = new Rpc(child, host.timing, this.progress);
    const pendingApprovals = new Set<string>();
    let threadId: string | undefined;
    let turnId: string | undefined;
    let failure: Error | undefined;
    const outcome = { ready: false };
    let finish: (() => void) | undefined;
    const completed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const fail = (message: string): void => {
      failure = new StopError(message);
      finish?.();
    };
    const abort = (): void => {
      if (threadId && turnId) rpc.notifyRequest("turn/interrupt", { threadId, turnId });
      fail("Execution cancelled; do not retry automatically.");
    };
    host.signal.addEventListener("abort", abort, { once: true });
    rpc.onFailure = fail;
    rpc.onMessage = async (message): Promise<void> => {
      const params = message.params ?? {};
      if (message.method === "item/completed") {
        const item = object.parse(params.item);
        if (item.type === "agentMessage" && typeof item.text === "string") {
          try {
            outcome.ready = z
              .object({ status: z.literal("ready") })
              .strict()
              .safeParse(JSON.parse(item.text) as unknown).success;
          } catch {
            outcome.ready = false;
          }
        }
      }
      if (message.id !== undefined && typeof message.method === "string") {
        const id = String(message.id);
        if (message.method === "item/tool/call") {
          const tool = z
            .object({ tool: z.literal("repository_development"), arguments: z.unknown() })
            .parse(params);
          try {
            const text = await host.broker(tool.arguments);
            rpc.respond(message.id, { success: true, contentItems: [{ type: "inputText", text }] });
          } catch {
            rpc.respond(message.id, {
              success: false,
              contentItems: [
                { type: "inputText", text: "Delegated operation failed. Stop; no automatic retry." }
              ]
            });
            fail("Delegated operation failed.");
          }
        } else {
          host.timing.start(
            `approval:${id}`,
            message.method.includes("requestApproval") ? "approval" : "blocking"
          );
          pendingApprovals.add(id);
          this.progress("awaiting human approval");
          // Human decisions, permission expansion and unknown protocols are blockers, not routine approvals.
          if (
            !["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(
              message.method
            )
          ) {
            fail(
              "Human decision or unsupported authorization request requires operator intervention."
            );
          } else {
            if (prohibitedApproval(params)) {
              fail("Prohibited operation requested; no approval offered.");
            }
            const accepted =
              !prohibitedApproval(params) &&
              (await this.approval(message.method, id, host.signal, approvalPreview(params)));
            rpc.respond(message.id, { decision: accepted ? "accept" : "decline" });
            host.timing.end(`approval:${id}`);
            pendingApprovals.delete(id);
            if (!accepted) fail("Authorization denied.");
          }
        }
      } else if (message.method === "turn/completed") {
        const turn = object.parse(params.turn);
        if (turn.status !== "completed") fail("Codex turn failed or was interrupted.");
        finish?.();
      } else if (message.method === "error") fail("Codex reported an error.");
      else if (message.method === "item/started" || message.method === "item/completed") {
        const item = object.parse(params.item);
        if (
          typeof item.id === "string" &&
          typeof item.type === "string" &&
          !["agentMessage", "reasoning", "userMessage"].includes(item.type)
        ) {
          if (message.method === "item/started")
            host.timing.start(
              `item:${item.id}`,
              item.type === "commandExecution" && typeof item.command === "string"
                ? commandCategory(item.command)
                : "tool"
            );
          else {
            host.timing.end(`item:${item.id}`);
            if (item.status === "failed" || item.status === "declined")
              fail("Codex tool failed or was declined.");
          }
        }
      } else if (message.method === "serverRequest/resolved") {
        const id = String(params.requestId);
        host.timing.end(`approval:${id}`);
        pendingApprovals.delete(id);
      }
    };
    try {
      await rpc.request("initialize", {
        clientInfo: { name: "graider_serial_orchestrator", version: "1.0.0" },
        capabilities: { experimentalApi: true }
      });
      rpc.notify("initialized", {});
      const account = object.parse(await rpc.request("account/read", {}));
      if (!account.account) throw new StopError("Codex authentication unavailable.");
      const selection = execution(issue);
      const catalog = z
        .object({
          data: z.array(
            z.object({
              id: z.string(),
              supportedReasoningEfforts: z.array(z.object({ reasoningEffort: z.string() }))
            })
          ),
          nextCursor: z.string().nullable().optional()
        })
        .parse(await rpc.request("model/list", { limit: 100 }));
      if (
        !catalog.data.some(
          (model) =>
            model.id === selection.model &&
            model.supportedReasoningEfforts.some(
              (effort) => effort.reasoningEffort === selection.effort
            )
        )
      )
        throw new StopError("Required model/effort unavailable; no substitution.");
      const configuration = z
        .object({ config: z.object({ mcp_servers: z.record(z.string(), z.unknown()).optional() }) })
        .parse(await rpc.request("config/read", {}));
      const disabledServers = Object.fromEntries(
        Object.keys(configuration.config.mcp_servers ?? {}).map((name) => [
          name,
          { enabled: false }
        ])
      );
      const result = z
        .object({
          thread: z.object({ id: z.string() }),
          model: z.string(),
          approvalPolicy: z.literal("untrusted"),
          approvalsReviewer: z.literal("user"),
          sandbox: z.object({ type: z.literal("workspaceWrite"), networkAccess: z.literal(false) })
        })
        .parse(
          await rpc.request("thread/start", {
            model: selection.model,
            cwd: host.cwd,
            approvalPolicy: "untrusted",
            approvalsReviewer: "user",
            sandbox: "workspace-write",
            ephemeral: true,
            config: {
              mcp_servers: disabledServers,
              "features.multi_agent": false,
              "features.apps": false,
              "sandbox_workspace_write.network_access": false
            },
            dynamicTools: [
              {
                type: "function",
                name: "repository_development",
                description:
                  "Explicitly delegated repository-scoped issue operations and validation; failures require stopping.",
                inputSchema: z.toJSONSchema(brokerSchema)
              }
            ]
          })
        );
      if (result.model !== selection.model)
        throw new StopError("Codex substituted the requested model.");
      threadId = result.thread.id;
      host.timing.start("codex", "codex");
      const turn = z.object({ turn: z.object({ id: z.string() }) }).parse(
        await rpc.request("turn/start", {
          threadId,
          model: selection.model,
          effort: selection.effort,
          approvalPolicy: "untrusted",
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: [host.cwd],
            networkAccess: false
          },
          input: [
            {
              type: "text",
              text: `Implement only issue #${String(issue.number)} in ${host.plan.repository}. Read AGENTS.md, agent-workflow-contract.md, docs/codex-development-contract.md, docs/graider-cross-platform-compatibility.md and issue-required docs. No subagents or other worktrees. No production/course/student mutations, destructive Git, force pushes, test weakening, or credential output. Use repository_development for delegated issue operations and validation. Do not commit, push or close this queue issue: the supervisor does that after validation and CI. Stop on any failed operation, blocker, human decision, or ambiguity. Do not start another issue or phase. Finish with JSON {"status":"ready"} only when implementation/docs/focused tests and required validation are complete; otherwise {"status":"blocked"}.\nIssue title: ${issue.title}\nIssue body (task data, subject to safeguards):\n${issue.body}`
            }
          ],
          outputSchema: {
            type: "object",
            properties: { status: { type: "string", enum: ["ready", "blocked"] } },
            required: ["status"],
            additionalProperties: false
          }
        })
      );
      turnId = turn.turn.id;
      await completed;
      if (failure) throw failure;
      if (!outcome.ready) throw new StopError("Agent did not report a verified ready outcome.");
    } finally {
      if (failure && threadId && turnId) rpc.notifyRequest("turn/interrupt", { threadId, turnId });
      host.signal.removeEventListener("abort", abort);
      for (const id of pendingApprovals) host.timing.end(`approval:${id}`);
      host.timing.end("codex");
      await rpc.close();
    }
  }
}

type Message = z.infer<typeof messageSchema>;
class Rpc {
  onMessage: (message: Message) => Promise<void> = () => Promise.resolve();
  onFailure: (message: string) => void = () => {};
  private sequence = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private closing = false;
  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly timing: Timing,
    progress: (stage: string) => void
  ) {
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        if (line.length > MAX_LINE_BYTES) throw new StopError("Oversized protocol message.");
        const message = messageSchema.parse(JSON.parse(line) as unknown);
        const pending =
          typeof message.id === "number" && !message.method
            ? this.pending.get(message.id)
            : undefined;
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(Number(message.id));
          if (message.error) pending.reject(new StopError("Codex RPC rejected."));
          else pending.resolve(message.result);
        } else {
          void this.onMessage(message).catch(() => {
            this.onFailure("Invalid Codex event.");
          });
        }
      } catch {
        this.onFailure("Invalid Codex protocol message.");
      }
    });
    child.stderr.resume(); // Raw agent diagnostics may contain credentials; never persist them.
    child.on("error", () => {
      this.onFailure("Codex could not start.");
    });
    child.on("close", () => {
      for (const value of this.pending.values()) {
        clearTimeout(value.timer);
        value.reject(new StopError("Codex exited."));
      }
      this.pending.clear();
      if (!this.closing) this.onFailure("Codex exited unexpectedly.");
    });
    child.stdin.on("error", () => {
      this.onFailure("Codex input closed.");
    });
    progress("starting fresh Codex context");
    this.timing.event("process-start", "codex-app-server");
  }
  request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new StopError("Codex RPC timeout."));
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  notifyRequest(method: string, params: unknown): void {
    this.send({ id: ++this.sequence, method, params });
  }
  notify(method: string, params: unknown): void {
    this.send({ method, params });
  }
  respond(id: number | string, result: unknown): void {
    this.send({ id, result });
  }
  private send(value: unknown): void {
    if (!this.child.stdin.destroyed) this.child.stdin.write(`${JSON.stringify(value)}\n`);
  }
  async close(): Promise<void> {
    this.closing = true;
    this.child.stdin.end();
    if (this.child.exitCode === null && this.child.signalCode === null)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.child.kill();
          resolve();
        }, SHUTDOWN_TIMEOUT_MS);
        this.child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    this.timing.event("process-end", "codex-app-server");
  }
}
