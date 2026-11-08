const CRC32_BITS_PER_BYTE = 8;
const CRC32_REFLECTED_POLYNOMIAL = 0xedb88320;
const CRC32_INITIAL_REMAINDER = 0xffffffff;
const CRC32_BYTE_MASK = 0xff;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION_MADE_BY_DOS = 20;
const ZIP_VERSION_NEEDED_TO_EXTRACT = 20;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < CRC32_BITS_PER_BYTE; bit += 1)
    value = (value >>> 1) ^ (value & 1 ? CRC32_REFLECTED_POLYNOMIAL : 0);
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
const u16 = (value: number): Buffer => {
  const output = Buffer.alloc(2);
  output.writeUInt16LE(value);
  return output;
};
const u32 = (value: number): Buffer => {
  const output = Buffer.alloc(4);
  output.writeUInt32LE(value);
  return output;
};
export const zip = (files: Readonly<Record<string, string>>): Uint8Array => {
  let offset = 0;
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  for (const [fileName, text] of Object.entries(files)) {
    const name = Buffer.from(fileName);
    const content = Buffer.from(text);
    const crc = crc32(content);
    const local = Buffer.concat([
      u32(ZIP_LOCAL_FILE_HEADER_SIGNATURE),
      u16(ZIP_VERSION_NEEDED_TO_EXTRACT),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(name.length),
      u16(0),
      name,
      content
    ]);
    locals.push(local);
    central.push(
      Buffer.concat([
        u32(ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE),
        u16(ZIP_VERSION_MADE_BY_DOS),
        u16(ZIP_VERSION_NEEDED_TO_EXTRACT),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(content.length),
        u32(content.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name
      ])
    );
    offset += local.length;
  }
  const directory = Buffer.concat(central);
  return Buffer.concat([
    ...locals,
    directory,
    u32(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE),
    u16(0),
    u16(0),
    u16(locals.length),
    u16(locals.length),
    u32(directory.length),
    u32(offset),
    u16(0)
  ]);
};

export const STATUS_SHA = "0123456789abcdef0123456789abcdef01234567";
export const statusArchive = (
  runId: number,
  status = "passed",
  resultFile = "results.json"
): Uint8Array =>
  zip({
    [resultFile]: JSON.stringify({
      schema_version: 1,
      status,
      checks: [{ name: "Unit Tests", status }]
    }),
    "grading-evidence/metadata.json": JSON.stringify({
      schemaVersion: 1,
      submissionCommitSha: STATUS_SHA,
      workflowRunId: String(runId),
      workflowRunAttempt: "1",
      compile: { outcome: "success" },
      junit: { outcome: status === "failed" ? "failure" : "success" },
      checkstyle: { outcome: "success" }
    })
  });
