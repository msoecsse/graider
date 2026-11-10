import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { z } from "zod";

const scenario = process.argv[2];
const log = process.argv[3];
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
  else if (message.method === "account/read")
    send({ id: message.id, result: { account: { type: "chatgpt" } } });
  else if (message.method === "model/list")
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
    if (scenario === "approval")
      send({
        id: "approval",
        method: "item/commandExecution/requestApproval",
        params: {
          itemId: "item",
          command: "npm test",
          cwd: process.cwd(),
          threadId: "thread",
          turnId: "turn"
        }
      });
    else if (scenario === "human")
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
  } else if (message.id === "approval" || message.id === "tool") ready();
});
