import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import observed from "../fixtures/orchestrator-transfer/observed.json" with { type: "json" };
import pins from "../../scripts/orchestrator/vm/reviewed-inputs.json" with { type: "json" };
import {
  decode,
  digest,
  encode,
  LIMITS,
  resources,
  SessionBudget,
  StreamModel,
  verifyAck,
  verifyInventory,
  verifyReadback
} from "../fixtures/orchestrator-transfer/model.js";

const SESSION_HEX_LENGTH = 32;
const DIGEST_HEX_LENGTH = 64;
const PATTERN_BYTE = 0xab;
const MAX_BYTE = 255;
const INVALID_BYTE = 0xff;
const MAX_OPERATIONS = 1126;
const MAX_RAW_BYTES = 36_700_160;
const MAX_WIRE_BYTES = 49_514_540;
const MAX_DATA_CHUNKS = 512;
const NEGATIVE_SIZE = -1;
const FRACTIONAL_SIZE = 0.5;
const CURRENT_BYTES = 12_679_270;
const CURRENT_FILES = 1530;
const CURRENT_MANIFEST = 246_631;
const CURRENT_INVENTORY = 210_533;
const CURRENT_DIRECTORIES = 444;
const CURRENT_DATA_CHUNKS = 387;
const CURRENT_OPERATIONS = 802;
const CURRENT_RAW_BYTES = 26_026_237;
const CURRENT_WIRE_BYTES = 35_115_460;
const SESSION = "a".repeat(SESSION_HEX_LENGTH);
const bytes = Buffer.alloc(LIMITS.chunk, PATTERN_BYTE);
const frame = { session: SESSION, sequence: 0, kind: "D" as const, offset: 0, bytes };
const wire = encode(frame);
const model = (): StreamModel => new StreamModel(SESSION, "D", bytes.length, digest(bytes));

describe("Slice 2C1 experimental framing (no production integration)", () => {
  it("verifies a large synthetic stream, ordered acknowledgments and final digest", () => {
    const source = Buffer.concat([bytes, bytes, Buffer.from([0, MAX_BYTE, 1])]);
    const receiver = new StreamModel(SESSION, "D", source.length, digest(source));
    for (let offset = 0, sequence = 0; offset < source.length; offset += LIMITS.chunk, sequence++) {
      const value = {
        ...frame,
        offset,
        sequence,
        bytes: source.subarray(offset, offset + LIMITS.chunk)
      };
      const encoded = encode(value);
      expect(encoded.length).toBeLessThanOrEqual(LIMITS.frame);
      verifyAck(receiver.accept(encoded), value);
    }
    receiver.finish();
    expect(() => receiver.accept(wire)).toThrow();
  });
  it("accepts an empty stream only with its empty digest", () => {
    new StreamModel(SESSION, "D", 0, digest(Buffer.alloc(0))).finish();
    expect(() => {
      new StreamModel(SESSION, "D", 0, digest(bytes)).finish();
    }).toThrow();
  });
  it("carries the global sequence across stream phases", () => {
    const manifest = new StreamModel(SESSION, "M", bytes.length, digest(bytes));
    manifest.accept(encode({ ...frame, kind: "M" }));
    manifest.finish();
    const data = new StreamModel(SESSION, "D", bytes.length, digest(bytes), 1);
    expect(() => data.accept(wire)).toThrow();
    const fresh = new StreamModel(SESSION, "D", bytes.length, digest(bytes), 1);
    fresh.accept(encode({ ...frame, sequence: 1 }));
    fresh.finish();
    const exhausted = new StreamModel(SESSION, "D", bytes.length, digest(bytes), LIMITS.operations);
    expect(() => exhausted.accept(encode({ ...frame, sequence: LIMITS.operations }))).toThrow();
  });
  it.each([
    ["partial frame", wire.subarray(0, wire.length - 1)],
    ["two frames", Buffer.concat([wire, wire])],
    ["extra newline", Buffer.concat([wire, Buffer.from("\n")])],
    ["wrong version", Buffer.from(wire.toString().replace("GRT1", "GRT2"))],
    ["noise", Buffer.concat([Buffer.from("boot noise\n"), wire])],
    ["noncanonical number", Buffer.from(wire.toString().replace(" 0 D", " 00 D"))],
    ["length mismatch", Buffer.from(wire.toString().replace(` ${String(bytes.length)} `, " 1 "))],
    [
      "corruption",
      Buffer.from(wire.toString().replace(digest(bytes), "0".repeat(DIGEST_HEX_LENGTH)))
    ],
    ["oversized line", Buffer.alloc(LIMITS.frame + 1)],
    ["high bytes", Buffer.concat([Buffer.from([INVALID_BYTE]), wire.subarray(1)])],
    ["invalid padding", Buffer.from(wire.toString().replace(/=\n$/, "===\n"))]
  ])("rejects %s before acknowledgment and poisons the stream", (_name, bad) => {
    const receiver = model();
    expect(() => receiver.accept(bad)).toThrow();
    expect(() => receiver.accept(wire)).toThrow();
  });
  it.each([
    ["session", { session: "b".repeat(SESSION_HEX_LENGTH) }],
    ["sequence", { sequence: 1 }],
    ["offset", { offset: 1 }],
    ["phase", { kind: "R" as const }],
    ["short chunk", { bytes: bytes.subarray(1) }]
  ])("rejects unexpected %s", (_name, change) => {
    expect(() => model().accept(encode({ ...frame, ...change }))).toThrow();
  });
  it("rejects duplicates, premature EOF, truncation, aggregate corruption and cancellation", () => {
    const receiver = model();
    receiver.accept(wire);
    expect(() => receiver.accept(wire)).toThrow();
    expect(() => {
      model().finish();
    }).toThrow();
    const corrupt = new StreamModel(SESSION, "D", bytes.length, "0".repeat(DIGEST_HEX_LENGTH));
    corrupt.accept(wire);
    expect(() => {
      corrupt.finish();
    }).toThrow();
    const cancelled = model();
    cancelled.cancel();
    expect(() => cancelled.accept(wire)).toThrow();
    expect(() => {
      cancelled.finish();
    }).toThrow();
  });
  it("rejects forged, stale, malformed and truncated ACKs", () => {
    const ack = model().accept(wire);
    verifyAck(ack, frame);
    for (const bad of [
      ack.subarray(1),
      ack.subarray(0, ack.length - 1),
      Buffer.from(ack.toString().replace(" ACK ", " OK "))
    ]) {
      expect(() => {
        verifyAck(bad, frame);
      }).toThrow();
    }
    expect(() => {
      verifyAck(ack, { ...frame, sequence: 1 });
    }).toThrow();
    expect(() => {
      verifyAck(ack, { ...frame, bytes: Buffer.alloc(bytes.length) });
    }).toThrow();
  });
  it("bounds decoded payloads and declared streams before allocation", () => {
    expect(() => encode({ ...frame, bytes: Buffer.alloc(LIMITS.chunk + 1) })).toThrow();
    expect(() => new StreamModel(SESSION, "M", LIMITS.manifest + 1, digest(bytes))).toThrow();
    expect(() => new StreamModel(SESSION, "I", LIMITS.inventory + 1, digest(bytes))).toThrow();
    expect(() => new StreamModel(SESSION, "D", LIMITS.total + 1, digest(bytes))).toThrow();
  });
});

it("binds recorded synthetic observations to fixture sources without claiming a CI VM run", () => {
  for (const [name, hash] of [
    ["probe.ts", observed.probeSha256],
    ["model.ts", observed.modelSha256],
    ["receive.sh", observed.receiverSha256]
  ]) {
    expect(
      digest(
        readFileSync(new URL(`../fixtures/orchestrator-transfer/${String(name)}`, import.meta.url))
      )
    ).toBe(hash);
  }
  expect(observed.imageSha256).toBe(pins.imageSha256);
  expect(observed.watchdog.status).toBe("reaped");
  expect(observed.byteAndModeVerification).toBe(true);
  expect(observed.rejectedDuplicate).toBe(true);
  expect(observed.payloadRemoved).toBe(true);
  expect(observed.bytes).toBeGreaterThan(LIMITS.chunk * 2);
});

describe("Slice 2C1 calculated resource envelope", () => {
  it("fits the admitted worst case including independent readback and two inventories", () => {
    const result = resources(
      Array.from({ length: LIMITS.files }, () => LIMITS.total / LIMITS.files),
      LIMITS.manifest,
      LIMITS.inventory,
      LIMITS.directories
    );
    expect(result.operations).toBe(MAX_OPERATIONS);
    expect(result.raw).toBe(MAX_RAW_BYTES);
    expect(result.wire).toBe(MAX_WIRE_BYTES);
    expect(result.wire).toBeLessThan(LIMITS.wire);
    expect(result.dataChunks).toBe(MAX_DATA_CHUNKS);
  });
  it.each([
    ["file", [LIMITS.file + 1], 1, 1, 1],
    ["total", Array.from({ length: 33 }, () => LIMITS.file), 1, 1, 1],
    ["count", Array.from({ length: LIMITS.files + 1 }, () => 0), 1, 1, 1],
    ["manifest", [0], LIMITS.manifest + 1, 1, 1],
    ["inventory", [0], 1, LIMITS.inventory + 1, 1],
    ["directories", [0], 1, 1, LIMITS.directories + 1],
    ["negative", [NEGATIVE_SIZE], 1, 1, 1],
    ["fraction", [FRACTIONAL_SIZE], 1, 1, 1],
    ["unsafe", [Number.MAX_SAFE_INTEGER + 1], 1, 1, 1]
  ] as const)("rejects %s admission overflow", (_name, sizes, manifest, inventory, directories) => {
    expect(() => resources(sizes, manifest, inventory, directories)).toThrow();
  });
  it("counts operations and wire bytes in both directions, with terminal failure", () => {
    const operations = new SessionBudget(0);
    for (let index = 0; index < LIMITS.operations; index++) operations.consume(1, 1, 0);
    expect(() => {
      operations.consume(0, 0, 0);
    }).toThrow();
    const wireBudget = new SessionBudget(0);
    const exchanges = Math.floor(LIMITS.wire / (LIMITS.frame * 2));
    for (let index = 0; index < exchanges; index++)
      wireBudget.consume(LIMITS.frame, LIMITS.frame, 0);
    expect(() => {
      wireBudget.consume(LIMITS.frame, LIMITS.frame, 0);
    }).toThrow();
    expect(() => {
      wireBudget.consume(0, 0, 0);
    }).toThrow();
  });
  it("does not renew the lease, resume after cancellation or infer reaping", () => {
    const budget = new SessionBudget(0);
    budget.consume(1, 1, LIMITS.lifetimeMs - 1);
    expect(() => {
      budget.consume(1, 1, LIMITS.lifetimeMs);
    }).toThrow();
    expect(() => {
      budget.consume(1, 1, 0);
    }).toThrow();
    const cancelled = new SessionBudget(0);
    cancelled.cancel();
    expect(() => {
      cancelled.consume(1, 1, 0);
    }).toThrow();
    expect(cancelled.cleanup(false)).toBe("retain-for-reconciliation");
    expect(new SessionBudget(0).cleanup(true)).toBe("discard-disposable");
  });
  it("calculates the current aggregate independently of per-file padding", () => {
    const mean = Math.floor(CURRENT_BYTES / CURRENT_FILES);
    const sizes = Array.from({ length: CURRENT_FILES - 1 }, () => mean);
    sizes.push(CURRENT_BYTES - mean * (CURRENT_FILES - 1));
    const measured = resources(sizes, CURRENT_MANIFEST, CURRENT_INVENTORY, CURRENT_DIRECTORIES);
    expect(measured.dataChunks).toBe(CURRENT_DATA_CHUNKS);
    expect(measured.operations).toBe(CURRENT_OPERATIONS);
    expect(measured.raw).toBe(CURRENT_RAW_BYTES);
    expect(measured.wire).toBe(CURRENT_WIRE_BYTES);
    expect(decode(wire).bytes.equals(bytes)).toBe(true);
  });
});

describe("supervisor verification projections (no filesystem authority)", () => {
  const files = [
    { path: "a", mode: "100644", size: bytes.length, sha256: digest(bytes) },
    { path: "empty", mode: "100755", size: 0, sha256: digest(Buffer.alloc(0)) }
  ];
  const inventory = [
    { path: "a", type: "file" as const, mode: "0644", size: bytes.length, links: 1 },
    { path: "empty", type: "file" as const, mode: "0755", size: 0, links: 1 }
  ];
  it("requires every readback byte and file digest, including empty files", () => {
    verifyReadback(bytes, files);
    expect(() => {
      verifyReadback(bytes.subarray(1), files);
    }).toThrow();
    expect(() => {
      verifyReadback(Buffer.concat([bytes, Buffer.from([0])]), files);
    }).toThrow();
    expect(() => {
      verifyReadback(Buffer.alloc(bytes.length), files);
    }).toThrow();
    expect(() => {
      verifyReadback(bytes, [
        { path: "a", mode: "100644", size: bytes.length, sha256: digest(Buffer.alloc(0)) }
      ]);
    }).toThrow();
  });
  it("requires exact deterministic inventory including paths, modes, types and links", () => {
    verifyInventory(Buffer.from(JSON.stringify(inventory)), inventory);
    for (const changed of [
      inventory.slice(1),
      [...inventory, inventory[0]],
      [...inventory].reverse(),
      [{ ...inventory[0], path: "../a" }, inventory[1]],
      [{ ...inventory[0], mode: "0777" }, inventory[1]],
      [{ ...inventory[0], links: 2 }, inventory[1]],
      [{ ...inventory[0], type: "symlink" }, inventory[1]],
      [{ ...inventory[0], size: 0 }, inventory[1]],
      [{ ...inventory[0], unexpected: true }, inventory[1]]
    ]) {
      expect(() => {
        verifyInventory(Buffer.from(JSON.stringify(changed)), inventory);
      }).toThrow();
    }
    expect(() => {
      verifyInventory(Buffer.from("["), inventory);
    }).toThrow();
    expect(() => {
      verifyInventory(Buffer.alloc(LIMITS.inventory + 1), inventory);
    }).toThrow();
  });
});
