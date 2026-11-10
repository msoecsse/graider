import { StopError } from "./errors.js";
export type Category =
  | "approval"
  | "test"
  | "build"
  | "lint"
  | "typecheck"
  | "tool"
  | "codex"
  | "ci-wait"
  | "blocking"
  | "unclassified";
export interface Interval {
  category: Category;
  start: number;
  end: number;
  id: string;
}
export interface Event {
  at: string;
  elapsedMs: number;
  type: string;
  id: string;
}
const precedence: Category[] = [
  "approval",
  "test",
  "build",
  "lint",
  "typecheck",
  "tool",
  "codex",
  "ci-wait",
  "blocking",
  "unclassified"
];
export class Timing {
  readonly events: Event[] = [];
  readonly intervals: Interval[] = [];
  private readonly active = new Map<string, { category: Category; start: number }>();
  private readonly origin: number;
  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly wall: () => string = () => new Date().toISOString()
  ) {
    this.origin = now();
  }
  event(type: string, id: string): void {
    this.events.push({ at: this.wall(), elapsedMs: this.now() - this.origin, type, id });
  }
  start(id: string, category: Category): void {
    if (this.active.has(id)) throw new StopError("Duplicate timing transition.");
    this.active.set(id, { category, start: this.now() - this.origin });
    this.event("start", id);
  }
  end(id: string): void {
    const active = this.active.get(id);
    if (active) {
      this.intervals.push({ ...active, end: this.now() - this.origin, id });
      this.active.delete(id);
      this.event("end", id);
    }
  }
  snapshot(sinceMs = 0): {
    totalMs: number;
    exclusiveMs: Record<Category, number>;
    approvals: { count: number; waitsMs: number[]; longestMs: number };
    intervals: Interval[];
    events: Event[];
  } {
    const absoluteEnd = this.now() - this.origin;
    const totalMs = absoluteEnd - sinceMs;
    const intervals = [
      ...this.intervals,
      ...[...this.active].map(([id, value]) => ({ ...value, id, end: absoluteEnd }))
    ]
      .filter((interval) => interval.end >= sinceMs)
      .map((interval) => ({
        ...interval,
        start: Math.max(0, interval.start - sinceMs),
        end: interval.end - sinceMs
      }));
    const points = [
      ...new Set([0, totalMs, ...intervals.flatMap((interval) => [interval.start, interval.end])])
    ].sort((a, b) => a - b);
    const exclusiveMs = Object.fromEntries(precedence.map((category) => [category, 0])) as Record<
      Category,
      number
    >;
    points.forEach((start, index) => {
      const end = points[index + 1];
      if (end !== undefined) {
        const category =
          precedence.find((candidate) =>
            intervals.some(
              (interval) =>
                interval.category === candidate && interval.start <= start && interval.end >= end
            )
          ) ?? "unclassified";
        exclusiveMs[category] += end - start;
      }
    });
    const waitsMs = intervals
      .filter((interval) => interval.category === "approval")
      .map((interval) => interval.end - interval.start);
    return {
      totalMs,
      exclusiveMs,
      approvals: { count: waitsMs.length, waitsMs, longestMs: Math.max(0, ...waitsMs) },
      intervals,
      events: this.events
        .filter((event) => event.elapsedMs >= sinceMs)
        .map((event) => ({ ...event, elapsedMs: event.elapsedMs - sinceMs }))
    };
  }
}
export function commandCategory(command: string): Category {
  const match =
    /^(?:npm|npm\.cmd)(?: --prefix ui)? (test|run (test:hygiene|typecheck(?::prepared)?|build(?::[a-z-]+)?|lint|format:check))(?: --.*)?$/.exec(
      command
    );
  if (!match) return "tool";
  if (command.includes("typecheck")) return "typecheck";
  if (command.includes("build")) return "build";
  if (command.includes("lint") || command.includes("format:")) return "lint";
  return "test";
}
