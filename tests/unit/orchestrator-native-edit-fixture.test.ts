import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import {
  nativeCases,
  nativeFixtureCode,
  verifyNativeObservations,
  type NativeObservation
} from "../fixtures/orchestrator-native-edit/native-cases.js";

const cases = nativeCases([
  { path: "/fake-host/protected.txt", contents: "protected canary" },
  { path: "/fake-host/authoritative/.git/config", contents: "git canary" },
  { path: "/fake-host/credentials/fake-auth.json", contents: "credential canary" },
  { path: "/fake-host/sibling/work.txt", contents: "sibling canary" }
]);

interface RecordedBoot {
  observations: NativeObservation[];
  ready: boolean;
  processGone: boolean;
  hostFixturesUnchanged: boolean;
  innerCommandOutput: string;
}
const recorded = JSON.parse(
  readFileSync(
    new URL("../fixtures/orchestrator-native-edit/observed.json", import.meta.url),
    "utf8"
  )
) as { boots: RecordedBoot[] };

describe("credential-free native edit fixture (offline, not OS acceptance)", () => {
  it("retains complete native outcomes from both manually observed fresh boots", () => {
    const freshBootCount = 2;
    expect(recorded.boots).toHaveLength(freshBootCount);
    for (const boot of recorded.boots) {
      expect(() => {
        verifyNativeObservations(cases, boot.observations);
      }).not.toThrow();
      expect(boot.ready && boot.processGone && boot.hostFixturesUnchanged).toBe(true);
      expect(boot.innerCommandOutput).toContain(
        "Seccomp:\t2\nNoNewPrivs:\t1\nPASS inner-command-sandbox"
      );
    }
  });

  it("attempts every hostile edit even when earlier native calls reject", async () => {
    const attempted: string[] = [];
    const observations: NativeObservation[] = [];
    const expectedByPatch = new Map(cases.map((entry) => [entry.patch, entry.expected]));
    await runInNewContext(`(async () => { ${nativeFixtureCode(cases)} })()`, {
      tools: {
        apply_patch: (patch: string): Promise<void> => {
          attempted.push(patch);
          return expectedByPatch.get(patch) === "rejected"
            ? Promise.reject(new Error("Fixture rejection"))
            : Promise.resolve();
        }
      },
      text: (value: string) => observations.push(JSON.parse(value) as NativeObservation)
    });
    expect(attempted).toEqual(cases.map((entry) => entry.patch));
    expect(() => {
      verifyNativeObservations(cases, observations);
    }).not.toThrow();
  });

  it("rejects a completed turn that stopped at the original failed write", () => {
    expect(() => {
      verifyNativeObservations(cases, [{ id: "valid-add", outcome: "rejected" }]);
    }).toThrow();
  });

  it("rejects missing, duplicate, unexpected and successful hostile outcomes", () => {
    const complete = cases.map(({ id, expected }) => ({ id, outcome: expected }));
    expect(() => {
      verifyNativeObservations(cases, complete.slice(1));
    }).toThrow();
    expect(() => {
      verifyNativeObservations(cases, [...complete, ...complete]);
    }).toThrow();
    expect(() => {
      verifyNativeObservations(cases, [...complete, { id: "unknown", outcome: "rejected" }]);
    }).toThrow();
    expect(() => {
      verifyNativeObservations(
        cases,
        complete.map((entry) =>
          entry.id === "deny-/work/escape" ? { ...entry, outcome: "completed" } : entry
        )
      );
    }).toThrow();
    expect(() => {
      verifyNativeObservations([], []);
    }).toThrow();
  });
});
