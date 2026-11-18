import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPlatform,
  dependencies,
  verifiedBytes
} from "../../scripts/orchestrator/vm/inputs.js";
import pins from "../../scripts/orchestrator/vm/reviewed-inputs.json" with { type: "json" };
import observed from "../fixtures/orchestrator-vm/observed.json" with { type: "json" };
import {
  nativeCases,
  verifyNativeObservations,
  type NativeObservation
} from "../fixtures/orchestrator-native-edit/native-cases.js";

describe("reviewed HVF input policy", () => {
  it("binds the reviewed runtime/image to actual recorded hostile boots, without treating this as OS proof", () => {
    expect(createHash("sha256").update(JSON.stringify(pins)).digest("hex")).toBe(
      observed.runtimeManifestSha256
    );
    expect(
      createHash("sha256")
        .update(
          readFileSync(new URL("../../scripts/orchestrator/vm/watchdog.mjs", import.meta.url))
        )
        .digest("hex")
    ).toBe(pins.watchdogSha256);
    expect(observed.imageSha256).toBe(pins.imageSha256);
    const hostCanaries = Array.from({ length: 4 }, (_, index) => ({
      path: `/fake-host/${String(index)}`,
      contents: "canary"
    }));
    for (const boot of observed.nativeBoots) {
      expect(() => {
        const observations = boot.observations.map(({ id, outcome }): NativeObservation => {
          if (outcome !== "completed" && outcome !== "rejected")
            throw new Error("Invalid observation");
          return { id, outcome };
        });
        verifyNativeObservations(nativeCases(hostCanaries), observations);
      }).not.toThrow();
      expect(boot.bytesVerified && boot.hostCanariesUnchanged && boot.reaped).toBe(true);
    }
    expect(observed.recovery.supervisorCrashReapingAttested).toBe(true);
  });
  it("rejects Windows/Linux, x64, and unknown OS versions instead of falling back", () => {
    expect(() => {
      assertPlatform("darwin", "arm64", "23.6.0");
    }).not.toThrow();
    for (const [platform, arch, release] of [
      ["win32", "x64", "23.6.0"],
      ["linux", "arm64", "23.6.0"],
      ["darwin", "x64", "23.6.0"],
      ["darwin", "arm64", "unknown"]
    ])
      expect(() => {
        assertPlatform(platform ?? "", arch ?? "", release ?? "");
      }).toThrow("no fallback");
  });
  it("verifies exact bytes and rejects directories and digest drift", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "graider-vm-input-"));
    try {
      const file = path.join(directory, "image");
      const bytes = Buffer.from("reviewed bytes");
      const digest = createHash("sha256").update(bytes).digest("hex");
      await writeFile(file, bytes);
      expect(await verifiedBytes(file, digest)).toEqual(bytes);
      await writeFile(file, "drift");
      await expect(verifiedBytes(file, digest)).rejects.toThrow("digest");
      await expect(verifiedBytes(directory, digest)).rejects.toThrow("type");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects unresolved loader paths rather than implicitly trusting runtime search", () => {
    expect(dependencies("qemu:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1)\n")).toEqual(
      ["/usr/lib/libSystem.B.dylib"]
    );
    expect(() =>
      dependencies("qemu:\n\t@rpath/libunknown.dylib (compatibility version 1)\n")
    ).toThrow();
  });
});
