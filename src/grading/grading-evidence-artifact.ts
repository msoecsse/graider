import { fromBuffer, type Entry, type ZipFile } from "yauzl";

import {
  parseGradingEvidence,
  type GradingEvidence,
  type GradingEvidenceArtifactInput,
  type GradingEvidenceParseError
} from "./grading-evidence-parser.js";

export const GRADING_EVIDENCE_METADATA_PATH = "grading-evidence/metadata.json";
export const GRADING_EVIDENCE_JUNIT_DIRECTORY = "grading-evidence/junit/";
export const GRADING_EVIDENCE_CHECKSTYLE_PATH = "grading-evidence/checkstyle.xml";

const BYTES_PER_MEBIBYTE = 1_048_576;
const MAX_GRADING_EVIDENCE_MEMBER_MEBIBYTES = 4;
const MAX_GRADING_EVIDENCE_TOTAL_MEBIBYTES = 16;

// These bounds allow substantial JUnit failure output while preventing an artifact from consuming
// unbounded process memory before the later retrieval layer can apply download-size limits.
export const MAX_GRADING_EVIDENCE_ARCHIVE_ENTRIES = 128;
export const MAX_GRADING_EVIDENCE_MEMBER_BYTES =
  MAX_GRADING_EVIDENCE_MEMBER_MEBIBYTES * BYTES_PER_MEBIBYTE;
export const MAX_GRADING_EVIDENCE_TOTAL_BYTES =
  MAX_GRADING_EVIDENCE_TOTAL_MEBIBYTES * BYTES_PER_MEBIBYTE;

export type GradingEvidenceArtifactErrorCode =
  | "evidence_archive_invalid"
  | "evidence_archive_limit_exceeded"
  | "evidence_archive_member_invalid";

export interface GradingEvidenceArtifactError {
  readonly code: GradingEvidenceArtifactErrorCode;
  readonly message: string;
}

export type GradingEvidenceArtifactDecodeResult =
  | { readonly status: "success"; readonly value: GradingEvidenceArtifactInput }
  | { readonly status: "failure"; readonly error: GradingEvidenceArtifactError };

export type GradingEvidenceArtifactParseResult =
  | { readonly status: "success"; readonly value: GradingEvidence }
  | {
      readonly status: "failure";
      readonly error: GradingEvidenceArtifactError | GradingEvidenceParseError;
    };

interface EvidenceMember {
  readonly path: string;
  readonly content: string;
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const ZIP_DIRECTORY_MODE = 0o040000;
const ZIP_REGULAR_FILE_MODE = 0o100000;
const ZIP_EXTERNAL_FILE_ATTRIBUTES_MODE_SHIFT = 16;
const ZIP_FILE_TYPE_MASK = 0o170000;

const archiveError = (
  code: GradingEvidenceArtifactErrorCode,
  message: string
): GradingEvidenceArtifactDecodeResult => ({ status: "failure", error: { code, message } });

const isDirectory = (entry: Entry): boolean => {
  const mode =
    (entry.externalFileAttributes >>> ZIP_EXTERNAL_FILE_ATTRIBUTES_MODE_SHIFT) & ZIP_FILE_TYPE_MASK;
  return entry.fileName.endsWith("/") || mode === ZIP_DIRECTORY_MODE;
};

const isRegularFile = (entry: Entry): boolean => {
  const mode =
    (entry.externalFileAttributes >>> ZIP_EXTERNAL_FILE_ATTRIBUTES_MODE_SHIFT) & ZIP_FILE_TYPE_MASK;
  return mode === 0 || mode === ZIP_REGULAR_FILE_MODE;
};

const normalizeArchivePath = (entryName: string): string | undefined => {
  if (
    entryName.length === 0 ||
    entryName.includes("\0") ||
    entryName.includes("\\") ||
    entryName.startsWith("/") ||
    entryName.includes("\uFFFD")
  ) {
    return undefined;
  }

  const segments = entryName.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return undefined;
  }
  return entryName;
};

const isJUnitReportPath = (memberPath: string): boolean =>
  memberPath.startsWith(GRADING_EVIDENCE_JUNIT_DIRECTORY) && memberPath.endsWith(".xml");

const decodeUtf8 = (bytes: Uint8Array): string | undefined => {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return undefined;
  }
};

const readEntry = async (zipFile: ZipFile, entry: Entry): Promise<Buffer | undefined> =>
  new Promise((resolve) => {
    zipFile.openReadStream(entry, (openError, stream) => {
      if (openError !== null) {
        resolve(undefined);
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer | Uint8Array) => {
        size += chunk.length;
        if (size > MAX_GRADING_EVIDENCE_MEMBER_BYTES) {
          stream.destroy();
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.once("error", () => {
        resolve(undefined);
      });
      stream.once("end", () => {
        resolve(size > MAX_GRADING_EVIDENCE_MEMBER_BYTES ? undefined : Buffer.concat(chunks));
      });
    });
  });

const decodeArchiveEntries = async (
  archiveBytes: Uint8Array
): Promise<GradingEvidenceArtifactDecodeResult> =>
  new Promise((resolve) => {
    fromBuffer(
      Buffer.from(archiveBytes),
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (openError, zipFile) => {
        if (openError !== null) {
          resolve(
            archiveError("evidence_archive_invalid", "The grading evidence archive is invalid.")
          );
          return;
        }
        if (zipFile.entryCount > MAX_GRADING_EVIDENCE_ARCHIVE_ENTRIES) {
          zipFile.close();
          resolve(
            archiveError(
              "evidence_archive_limit_exceeded",
              "The grading evidence archive contains too many entries."
            )
          );
          return;
        }

        const metadata: EvidenceMember[] = [];
        const checkstyle: EvidenceMember[] = [];
        const junit: EvidenceMember[] = [];
        const junitPaths = new Set<string>();
        let totalBytes = 0;
        let finished = false;

        const finish = (result: GradingEvidenceArtifactDecodeResult): void => {
          if (!finished) {
            finished = true;
            zipFile.close();
            resolve(result);
          }
        };

        zipFile.once("error", () => {
          finish(
            archiveError("evidence_archive_invalid", "The grading evidence archive is invalid.")
          );
        });
        zipFile.once("end", () => {
          if (metadata.length !== 1) {
            finish(
              archiveError(
                "evidence_archive_member_invalid",
                "The grading evidence archive must contain exactly one metadata file."
              )
            );
            return;
          }
          if (checkstyle.length > 1) {
            finish(
              archiveError(
                "evidence_archive_member_invalid",
                "The grading evidence archive contains ambiguous Checkstyle evidence."
              )
            );
            return;
          }

          const metadataMember = metadata[0];
          if (metadataMember === undefined) {
            finish(
              archiveError(
                "evidence_archive_member_invalid",
                "The grading evidence archive is missing metadata."
              )
            );
            return;
          }
          const checkstyleMember = checkstyle[0];
          finish({
            status: "success",
            value: {
              metadataJson: metadataMember.content,
              junitReports: junit
                .sort((left, right) => left.path.localeCompare(right.path))
                .map(({ path, content }) => ({ name: path, content })),
              ...(checkstyleMember === undefined ? {} : { checkstyleXml: checkstyleMember.content })
            }
          });
        });
        const processEntry = async (entry: Entry): Promise<void> => {
          if (finished) {
            return;
          }
          const directory = isDirectory(entry);
          const memberPath = normalizeArchivePath(
            directory && entry.fileName.endsWith("/")
              ? entry.fileName.slice(0, entry.fileName.length - 1)
              : entry.fileName
          );
          if (memberPath === undefined) {
            finish(
              archiveError(
                "evidence_archive_member_invalid",
                "The grading evidence archive contains an unsafe member path."
              )
            );
            return;
          }
          if (directory) {
            zipFile.readEntry();
            return;
          }
          if (!isRegularFile(entry)) {
            finish(
              archiveError(
                "evidence_archive_member_invalid",
                "The grading evidence archive contains a non-file evidence member."
              )
            );
            return;
          }

          const isMetadata = memberPath === GRADING_EVIDENCE_METADATA_PATH;
          const isCheckstyle = memberPath === GRADING_EVIDENCE_CHECKSTYLE_PATH;
          const isJUnit = isJUnitReportPath(memberPath);
          if (!isMetadata && !isCheckstyle && !isJUnit) {
            zipFile.readEntry();
            return;
          }
          if (entry.uncompressedSize > MAX_GRADING_EVIDENCE_MEMBER_BYTES) {
            finish(
              archiveError(
                "evidence_archive_limit_exceeded",
                "A grading evidence member exceeds the supported size."
              )
            );
            return;
          }
          totalBytes += entry.uncompressedSize;
          if (totalBytes > MAX_GRADING_EVIDENCE_TOTAL_BYTES) {
            finish(
              archiveError(
                "evidence_archive_limit_exceeded",
                "The grading evidence archive exceeds the supported total size."
              )
            );
            return;
          }

          const bytes = await readEntry(zipFile, entry);
          const content = bytes === undefined ? undefined : decodeUtf8(bytes);
          if (content === undefined) {
            finish(
              archiveError(
                "evidence_archive_member_invalid",
                "A grading evidence member is not valid UTF-8 text."
              )
            );
            return;
          }
          const member = { path: memberPath, content };
          if (isMetadata) {
            metadata.push(member);
          } else if (isCheckstyle) {
            checkstyle.push(member);
          } else {
            if (junitPaths.has(memberPath)) {
              finish(
                archiveError(
                  "evidence_archive_member_invalid",
                  "The grading evidence archive contains duplicate JUnit evidence."
                )
              );
              return;
            }
            junitPaths.add(memberPath);
            junit.push(member);
          }
          zipFile.readEntry();
        };
        zipFile.on("entry", (entry: Entry) => {
          void processEntry(entry).catch(() => {
            finish(
              archiveError(
                "evidence_archive_member_invalid",
                "Unable to read a grading evidence archive member."
              )
            );
          });
        });
        zipFile.readEntry();
      }
    );
  });

export const decodeGradingEvidenceArtifact = async (
  archiveBytes: Uint8Array
): Promise<GradingEvidenceArtifactDecodeResult> => decodeArchiveEntries(archiveBytes);

export const parseGradingEvidenceArtifact = async (
  archiveBytes: Uint8Array
): Promise<GradingEvidenceArtifactParseResult> => {
  const decoded = await decodeGradingEvidenceArtifact(archiveBytes);
  return decoded.status === "failure" ? decoded : parseGradingEvidence(decoded.value);
};
