import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { z } from "zod";

const scenario = process.argv[2];
const log = process.argv[3];
// If the execution gate regresses, this models a native edit outside any broker.
if (scenario === "hostile-native-edit" && log) writeFileSync(log, "unauthorized native edit");
const send = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};
const ready = (): void => {
  send({
    method: "item/completed",
    params: {
      item: {
        id: "final",
        type: "agentMessage",
        text: JSON.stringify({ status: scenario === "blocked" ? "blocked" : "ready" })
      }
    }
  });
  send({ method: "turn/completed", params: { turn: { id: "turn", status: "completed" } } });
};
const approval = (id: string, command = "npm test"): void => {
  send({
    id,
    method:
      id === "second" ? "item/fileChange/requestApproval" : "item/commandExecution/requestApproval",
    params: { command, cwd: process.cwd(), threadId: "thread", turnId: "turn" }
  });
};
let responses = 0;
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      method: z.string().optional(),
      params: z.unknown().optional(),
      result: z.unknown().optional()
    })
    .parse(JSON.parse(line) as unknown);
  if (log) appendFileSync(log, `${JSON.stringify({ ...message, pid: process.pid })}\n`);
  if (message.method === "initialize") send({ id: message.id, result: {} });
  else if (message.method === "account/read") {
    if (scenario === "cancel-setup")
      send({
        method: "item/started",
        params: { item: { id: "setup-wait", type: "commandExecution" } }
      });
    else send({ id: message.id, result: { account: { type: "chatgpt" } } });
  } else if (message.method === "model/list")
    send({
      id: message.id,
      result: {
        data: [{ id: "gpt-6.1-sol", supportedReasoningEfforts: [{ reasoningEffort: "high" }] }],
        nextCursor: null
      }
    });
  else if (message.method === "config/read")
    send({ id: message.id, result: { config: { mcp_servers: {} } } });
  else if (message.method === "windowsSandbox/readiness")
    send({ id: message.id, result: { status: "ready" } });
  else if (message.method === "thread/start")
    send({
      id: message.id,
      result: {
        thread: { id: `fresh-${String(process.pid)}` },
        model: "gpt-6.1-sol",
        approvalPolicy: "untrusted",
        approvalsReviewer: "user",
        sandbox: { type: "workspaceWrite", networkAccess: false }
      }
    });
  else if (message.method === "turn/start") {
    send({ id: message.id, result: { turn: { id: "turn" } } });
    if (scenario === "approval") approval("approval");
    else if (scenario === "prohibited") {
      approval("approval", "rm -rf directory");
      send({ method: "error", params: {} });
      send({ method: "turn/completed", params: { turn: { status: "interrupted" } } });
    } else if (["successive", "concurrent", "resolved", "unresolved"].includes(scenario ?? "")) {
      approval("first", "cat AGENTS.md");
      if (scenario === "concurrent") approval("second");
      if (scenario === "resolved")
        send({ method: "serverRequest/resolved", params: { requestId: "first" } });
      if (scenario === "unresolved") ready();
    } else if (scenario === "human")
      send({ id: "human", method: "item/tool/requestUserInput", params: {} });
    else if (scenario === "tool")
      send({
        id: "tool",
        method: "item/tool/call",
        params: {
          tool: "repository_development",
          arguments: { action: "validate", validation: "test" }
        }
      });
    else if (scenario !== "cancel") ready();
  } else if (message.method === "turn/interrupt") {
    send({ id: message.id, result: {} });
    send({ method: "turn/completed", params: { turn: { id: "turn", status: "interrupted" } } });
  } else if (message.id === "first" || message.id === "second") {
    responses += 1;
    if (scenario === "successive" && responses === 1) approval("second");
    if (responses === 2) ready();
  } else if (message.id === "approval" || message.id === "tool") ready();
});
