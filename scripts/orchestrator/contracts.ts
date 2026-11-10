import { StopError } from "./errors.js";
import { z } from "zod";

const HTTP_FORBIDDEN = 403;
export const operations = [
  "issue-create",
  "issue-update",
  "issue-close",
  "issue-label",
  "commit",
  "push",
  "validate"
] as const;
export type Operation = (typeof operations)[number];
const issueNumber = z.number().int().positive();
export const planSchema = z
  .object({
    repository: z.literal("msoecsse/graider"),
    branch: z.literal("remote-course-v2"),
    expectedHead: z.string().regex(/^[a-f0-9]{40}$/),
    issues: z
      .array(
        z
          .object({
            number: issueNumber,
            dependencies: z.array(issueNumber),
            phase: z.string().min(1),
            audit: z.boolean()
          })
          .strict()
      )
      .min(1),
    requiredChecks: z.array(z.string().min(1)).min(1),
    authorization: z
      .object({
        repository: z.literal("msoecsse/graider"),
        branch: z.literal("remote-course-v2"),
        cliFallback: z.literal(true),
        operations: z.array(z.enum(operations))
      })
      .strict()
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export interface Issue {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  dependencies: number[];
}
export const models: Record<string, { model: string; effort: "low" | "medium" | "high" }> = {
  "codex:luna-low": { model: "gpt-6-luna", effort: "low" },
  "codex:sol-medium": { model: "gpt-6.1-sol", effort: "medium" },
  "codex:sol-high": { model: "gpt-6.1-sol", effort: "high" }
};
export function execution(issue: Issue): { model: string; effort: "low" | "medium" | "high" } {
  const labels = issue.labels.filter((label) => label.startsWith("codex:"));
  const selected = labels.length === 1 ? models[labels[0] ?? ""] : undefined;
  if (
    !selected ||
    issue.labels.filter((label) => label.startsWith("context:")).join() !== "context:fresh"
  )
    throw new StopError("Issue requires one supported execution label and context:fresh.");
  return selected;
}
export function validatePlan(plan: Plan): void {
  const numbers = plan.issues.map((issue) => issue.number);
  if (new Set(numbers).size !== numbers.length) throw new StopError("Duplicate queue issue.");
  const phase = plan.issues[0]?.phase;
  if (
    plan.issues.some(
      (issue, index) => issue.phase !== phase || (issue.audit && index !== plan.issues.length - 1)
    )
  )
    throw new StopError("Queue crosses a phase boundary or continues after an audit.");
  if (new Set(plan.requiredChecks).size !== plan.requiredChecks.length)
    throw new StopError("Duplicate required CI check.");
  for (const operation of operations) authorize(plan, operation);
}
export function authorize(plan: Plan, operation: Operation): void {
  if (!plan.authorization.operations.includes(operation))
    throw new StopError("Operation lacks scoped delegation.");
}
export function validateIssue(
  issue: Issue,
  entry: Plan["issues"][number],
  closed: ReadonlySet<number>
): void {
  execution(issue);
  if (
    issue.state.toLowerCase() !== "open" ||
    issue.labels.some((label) => /blocked|needs-human-decision/i.test(label))
  )
    throw new StopError("Issue is closed, blocked, or requires a human decision.");
  if (/\baudit\b/i.test(issue.title) && !entry.audit)
    throw new StopError("Audit must be explicitly marked in the plan.");
  const dependencies = new Set([...entry.dependencies, ...issue.dependencies]);
  if ([...dependencies].some((number) => !closed.has(number)))
    throw new StopError("Issue dependency is not closed.");
}

export interface Check {
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}
export function ciState(checks: Check[], required: string[]): "pending" | "success" {
  const selected = required.map((name) => checks.filter((check) => check.name === name));
  if (selected.some((matches) => matches.length > 1))
    throw new StopError("Ambiguous CI check results.");
  if (
    selected.some((matches) =>
      matches.some((check) => check.status === "completed" && check.conclusion !== "success")
    )
  )
    throw new StopError("Required CI failed or was inconclusive.");
  return selected.every(
    (matches) =>
      matches.length === 1 &&
      matches[0]?.status === "completed" &&
      matches[0].conclusion === "success"
  )
    ? "success"
    : "pending";
}

export interface PermissionTransport {
  permissions(): Promise<boolean>;
}
export async function selectTransport(
  integration: PermissionTransport | undefined,
  cli: PermissionTransport,
  fallback: boolean
): Promise<PermissionTransport> {
  if (integration) {
    try {
      if (!(await integration.permissions()))
        throw new StopError("Insufficient integration permissions.");
      return integration;
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "status" in error &&
          error.status === HTTP_FORBIDDEN &&
          fallback
        )
      )
        throw new StopError("Integration authorization failed.", { cause: error });
    }
  }
  if (!fallback || !(await cli.permissions()))
    throw new StopError("CLI unavailable or lacks verified repository permissions.");
  return cli;
}
