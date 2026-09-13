import { describe, expect, it } from "vitest";

import {
  GRADING_EVIDENCE_CHECKSTYLE_PATH,
  GRADING_EVIDENCE_JUNIT_DIRECTORY,
  GRADING_EVIDENCE_METADATA_PATH,
  MAX_GRADING_EVIDENCE_ARCHIVE_ENTRIES,
  MAX_GRADING_EVIDENCE_MEMBER_BYTES,
  MAX_GRADING_EVIDENCE_TOTAL_BYTES,
  decodeGradingEvidenceArtifact,
  parseGradingEvidenceArtifact
} from "../../../src/grading/grading-evidence-artifact.js";
import { parseGradingEvidence } from "../../../src/grading/grading-evidence-parser.js";

interface ZipEntry {
  readonly name: string;
  readonly content: Uint8Array | string;
}

const metadata = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    schemaVersion: 1,
    submissionCommitSha: "0123456789abcdef0123456789abcdef01234567",
    workflowRunId: "1234",
    workflowRunAttempt: "2",
    compile: { outcome: "success" },
    junit: { outcome: "success" },
    checkstyle: { outcome: "success" },
    ...overrides
  });
const junit = (name: string, body = ""): string =>
  `<testsuite name="suite"><testcase name="${name}">${body}</testcase></testsuite>`;
const checkstyle = (): string =>
  '<checkstyle><file name="src/Example.java"><error line="4" severity="warning" message="Avoid tabs"/></file></checkstyle>';

const CRC32_BITS_PER_BYTE = 8;
const CRC32_REFLECTED_POLYNOMIAL = 0xedb88320;
const CRC32_INITIAL_REMAINDER = 0xffffffff;
const CRC32_BYTE_MASK = 0xff;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION_MADE_BY_DOS = 20;
const ZIP_VERSION_NEEDED_TO_EXTRACT = 20;
const INVALID_UTF8_LEADING_BYTE = 0xc3;
const INVALID_UTF8_NON_CONTINUATION_BYTE = 0x28;
const TRUNCATED_ARCHIVE_BYTE_LENGTH = 12;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < CRC32_BITS_PER_BYTE; bit += 1) {
    value = (value >>> 1) ^ (value & 1 ? CRC32_REFLECTED_POLYNOMIAL : 0);
  }
  return value >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let value = CRC32_INITIAL_REMAINDER;
  for (const byte of bytes) {
    const tableValue = crcTable[(value ^ byte) & CRC32_BYTE_MASK];
    if (tableValue === undefined) throw new Error("CRC table entry is missing.");
    value = (value >>> CRC32_BITS_PER_BYTE) ^ tableValue;
  }
  return (value ^ CRC32_INITIAL_REMAINDER) >>> 0;
};

const uint16 = (value: number): Buffer => {
  const output = Buffer.alloc(2);
  output.writeUInt16LE(value);
  return output;
};
const uint32 = (value: number): Buffer => {
  const output = Buffer.alloc(4);
  output.writeUInt32LE(value);
  return output;
};

// Small stored ZIP builder keeps binary fixtures out of the repository.
const zip = (entries: readonly ZipEntry[]): Uint8Array => {
  let offset = 0;
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content =
      typeof entry.content === "string" ? Buffer.from(entry.content, "utf8") : entry.content;
    const checksum = crc32(content);
    const header = Buffer.concat([
      uint32(ZIP_LOCAL_FILE_HEADER_SIGNATURE),
      uint16(ZIP_VERSION_NEEDED_TO_EXTRACT),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(content.length),
      uint32(content.length),
      uint16(name.length),
      uint16(0),
      name,
      content
    ]);
    locals.push(header);
    central.push(
      Buffer.concat([
        uint32(ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE),
        uint16(ZIP_VERSION_MADE_BY_DOS),
        uint16(ZIP_VERSION_NEEDED_TO_EXTRACT),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(checksum),
        uint32(content.length),
        uint32(content.length),
        uint16(name.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        name
      ])
    );
    offset += header.length;
  }
  const centralBytes = Buffer.concat(central);
  return Buffer.concat([
    ...locals,
    centralBytes,
    uint32(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralBytes.length),
    uint32(offset),
    uint16(0)
  ]);
};

const artifact = (entries: readonly ZipEntry[]): Uint8Array =>
  zip([{ name: GRADING_EVIDENCE_METADATA_PATH, content: metadata() }, ...entries]);

describe("grading evidence artifact decoding", () => {
  it("decodes the canonical artifact members and composes Slice 37", async () => {
    const archive = artifact([
      { name: "graider-output/grading-results.json", content: "{}" },
      { name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}b.xml`, content: junit("second") },
      { name: GRADING_EVIDENCE_CHECKSTYLE_PATH, content: checkstyle() },
      { name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}a.xml`, content: junit("first") },
      { name: "other/TEST-malicious.xml", content: junit("ignored") }
    ]);

    const decoded = await decodeGradingEvidenceArtifact(archive);
    expect(decoded).toEqual({
      status: "success",
      value: {
        metadataJson: metadata(),
        junitReports: [
          { name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}a.xml`, content: junit("first") },
          { name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}b.xml`, content: junit("second") }
        ],
        checkstyleXml: checkstyle()
      }
    });
    expect(await parseGradingEvidenceArtifact(archive)).toEqual(
      decoded.status === "success" ? parseGradingEvidence(decoded.value) : decoded
    );
  });

  it("preserves report absence and zero-result XML presence", async () => {
    const skipped = await decodeGradingEvidenceArtifact(
      zip([
        {
          name: GRADING_EVIDENCE_METADATA_PATH,
          content: metadata({ compile: { outcome: "failure" }, junit: { outcome: "skipped" } })
        }
      ])
    );
    const zeroResults = await decodeGradingEvidenceArtifact(
      artifact([
        { name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}empty.xml`, content: '<testsuite name="x"/>' },
        { name: GRADING_EVIDENCE_CHECKSTYLE_PATH, content: "<checkstyle/>" }
      ])
    );

    expect(skipped).toEqual({
      status: "success",
      value: {
        metadataJson: metadata({ compile: { outcome: "failure" }, junit: { outcome: "skipped" } }),
        junitReports: []
      }
    });
    expect(zeroResults).toMatchObject({
      status: "success",
      value: {
        junitReports: [{ name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}empty.xml` }],
        checkstyleXml: "<checkstyle/>"
      }
    });
  });

  it("leaves metadata and XML validation to Slice 37", async () => {
    const malformedMetadata = await parseGradingEvidenceArtifact(
      zip([{ name: GRADING_EVIDENCE_METADATA_PATH, content: "{" }])
    );
    const malformedJunit = await parseGradingEvidenceArtifact(
      artifact([{ name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}bad.xml`, content: "<testsuite>" }])
    );
    const inconsistent = await parseGradingEvidenceArtifact(
      zip([
        {
          name: GRADING_EVIDENCE_METADATA_PATH,
          content: metadata({ junit: { outcome: "skipped" } })
        },
        { name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}report.xml`, content: junit("test") }
      ])
    );

    expect(malformedMetadata).toMatchObject({
      status: "failure",
      error: { code: "metadata_invalid" }
    });
    expect(malformedJunit).toMatchObject({
      status: "failure",
      error: { code: "junit_report_invalid" }
    });
    expect(inconsistent).toMatchObject({
      status: "failure",
      error: { code: "evidence_inconsistent" }
    });
  });

  it("rejects invalid archives, unsafe paths, duplicate canonical members, and invalid text", async () => {
    const cases = [
      { name: "non-zip", archive: new Uint8Array([1, 2, 3]) },
      { name: "missing metadata", archive: zip([]) },
      {
        name: "duplicate metadata",
        archive: zip([
          { name: GRADING_EVIDENCE_METADATA_PATH, content: metadata() },
          { name: GRADING_EVIDENCE_METADATA_PATH, content: metadata() }
        ])
      },
      {
        name: "duplicate checkstyle",
        archive: zip([
          { name: GRADING_EVIDENCE_METADATA_PATH, content: metadata() },
          { name: GRADING_EVIDENCE_CHECKSTYLE_PATH, content: checkstyle() },
          { name: GRADING_EVIDENCE_CHECKSTYLE_PATH, content: checkstyle() }
        ])
      },
      {
        name: "duplicate junit",
        archive: zip([
          { name: GRADING_EVIDENCE_METADATA_PATH, content: metadata() },
          { name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}duplicate.xml`, content: junit("first") },
          { name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}duplicate.xml`, content: junit("second") }
        ])
      },
      {
        name: "traversal",
        archive: zip([{ name: "../grading-evidence/metadata.json", content: metadata() }])
      },
      {
        name: "absolute",
        archive: zip([{ name: "/grading-evidence/metadata.json", content: metadata() }])
      },
      {
        name: "backslash",
        archive: zip([{ name: "grading-evidence\\metadata.json", content: metadata() }])
      },
      {
        name: "invalid utf8",
        archive: zip([
          {
            name: GRADING_EVIDENCE_METADATA_PATH,
            content: new Uint8Array([INVALID_UTF8_LEADING_BYTE, INVALID_UTF8_NON_CONTINUATION_BYTE])
          }
        ])
      }
    ];

    for (const testCase of cases) {
      const result = await decodeGradingEvidenceArtifact(testCase.archive);
      expect(result.status, testCase.name).toBe("failure");
    }
    await expect(
      decodeGradingEvidenceArtifact(artifact([]).subarray(0, TRUNCATED_ARCHIVE_BYTE_LENGTH))
    ).resolves.toMatchObject({
      status: "failure",
      error: { code: "evidence_archive_invalid" }
    });
  });

  it("enforces entry and evidence-member resource limits before parsing", async () => {
    await expect(
      decodeGradingEvidenceArtifact(
        zip(
          Array.from({ length: MAX_GRADING_EVIDENCE_ARCHIVE_ENTRIES + 1 }, (_, index) => ({
            name: `ignored/${String(index)}.txt`,
            content: "x"
          }))
        )
      )
    ).resolves.toMatchObject({
      status: "failure",
      error: { code: "evidence_archive_limit_exceeded" }
    });
    await expect(
      decodeGradingEvidenceArtifact(
        artifact([
          {
            name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}large.xml`,
            content: Buffer.alloc(MAX_GRADING_EVIDENCE_MEMBER_BYTES + 1)
          }
        ])
      )
    ).resolves.toMatchObject({
      status: "failure",
      error: { code: "evidence_archive_limit_exceeded" }
    });
    const totalPart = Buffer.alloc(Math.floor(MAX_GRADING_EVIDENCE_TOTAL_BYTES / 4) + 1);
    await expect(
      decodeGradingEvidenceArtifact(
        artifact(
          Array.from({ length: 4 }, (_, index) => ({
            name: `${GRADING_EVIDENCE_JUNIT_DIRECTORY}${String(index)}.xml`,
            content: totalPart
          }))
        )
      )
    ).resolves.toMatchObject({
      status: "failure",
      error: { code: "evidence_archive_limit_exceeded" }
    });
  });
});
