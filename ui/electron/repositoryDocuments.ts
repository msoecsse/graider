import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import yauzl from "yauzl";
import type { Readable } from "node:stream";
import {
  DOCUMENT_LIMITS,
  DOCUMENT_EXCLUDED_DIRECTORIES,
  DOCUMENT_TOO_LARGE,
  isRepositoryDocumentPath,
  repositoryDocumentKind
} from "./repositoryDocumentPolicy.js";

export const discoverRepositoryDocuments = async (root: string): Promise<string[]> => {
  const documents: string[] = [];
  let entriesSeen = 0;
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > DOCUMENT_LIMITS.repositoryDepth) throw new Error(DOCUMENT_TOO_LARGE);
    const entries = await fs.opendir(directory);
    for await (const entry of entries) {
      entriesSeen += 1;
      if (entriesSeen > DOCUMENT_LIMITS.repositoryEntries) throw new Error(DOCUMENT_TOO_LARGE);
      if (!DOCUMENT_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) {
        const candidate = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(candidate, depth + 1);
        else if (entry.isFile()) {
          const relative = path.relative(root, candidate).split(path.sep).join("/");
          if (isRepositoryDocumentPath(relative)) documents.push(relative);
        }
      }
    }
  };
  await visit(root, 0);
  return documents.sort((left, right) => left.localeCompare(right));
};

export const validateDocxArchive = (bytes: Buffer): Promise<void> =>
  new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(new Error("This DOCX is damaged or unsupported."));
      else {
        let expanded = 0;
        let images = 0;
        let entries = 0;
        let hasDocument = false;
        let settled = false;
        let activeStream: Readable | undefined;
        const timer = setTimeout(() => {
          fail(DOCUMENT_TOO_LARGE);
        }, DOCUMENT_LIMITS.processingMilliseconds);
        const fail = (message: string): void => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            activeStream?.destroy();
            zip.close();
            reject(new Error(message));
          }
        };
        zip.on("error", () => {
          fail("This DOCX is damaged or unsupported.");
        });
        zip.on("entry", (entry: yauzl.Entry) => {
          entries += 1;
          expanded += entry.uncompressedSize;
          if (entry.fileName.startsWith("word/media/")) images += entry.uncompressedSize;
          hasDocument ||= entry.fileName === "word/document.xml";
          if (
            expanded > DOCUMENT_LIMITS.docxExpandedBytes ||
            images > DOCUMENT_LIMITS.imageBytes ||
            entries > DOCUMENT_LIMITS.docxEntries
          )
            fail(DOCUMENT_TOO_LARGE);
          else if (entry.isEncrypted()) fail("Encrypted DOCX files cannot be displayed.");
          else if (!settled) {
            // Verify actual inflation, including forged central-directory sizes,
            // before the renderer's ZIP parser receives any document bytes.
            zip.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) fail("This DOCX is damaged or unsupported.");
              else if (settled) stream.destroy();
              else {
                activeStream = stream;
                let actualBytes = 0;
                stream.on("data", (chunk: Buffer) => {
                  actualBytes += chunk.length;
                  if (
                    actualBytes > entry.uncompressedSize ||
                    actualBytes > DOCUMENT_LIMITS.docxExpandedBytes
                  )
                    fail(DOCUMENT_TOO_LARGE);
                });
                stream.on("error", () => {
                  fail("This DOCX is damaged or unsupported.");
                });
                stream.on("end", () => {
                  activeStream = undefined;
                  if (!settled) zip.readEntry();
                });
              }
            });
          }
        });
        zip.on("end", () => {
          if (hasDocument && !settled) {
            settled = true;
            clearTimeout(timer);
            zip.close();
            resolve();
          } else fail("This DOCX is damaged or unsupported.");
        });
        zip.readEntry();
      }
    });
  });

export const readRepositoryDocument = async (root: string, file: string): Promise<Uint8Array> => {
  if (!isRepositoryDocumentPath(file)) throw new Error("Invalid repository document path.");
  const canonicalRoot = await fs.realpath(root);
  let candidate = canonicalRoot;
  // Reject every symlink component, including directory links, before opening.
  for (const part of file.split("/")) {
    candidate = path.join(candidate, part);
    if ((await fs.lstat(candidate)).isSymbolicLink())
      throw new Error("Linked documents cannot be displayed.");
  }
  const canonicalFile = await fs.realpath(candidate);
  const relative = path.relative(canonicalRoot, canonicalFile);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error("Invalid repository document path.");
  const handle = await fs.open(canonicalFile, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("This document is unavailable.");
    if (stat.size > DOCUMENT_LIMITS.fileBytes) throw new Error(DOCUMENT_TOO_LARGE);
    // A bounded read also protects against a file growing after stat.
    const bytes = Buffer.alloc(stat.size + 1);
    let received = 0;
    let ended = false;
    for (; received < bytes.length && !ended; ) {
      const { bytesRead } = await handle.read(bytes, received, bytes.length - received, received);
      received += bytesRead;
      ended = bytesRead === 0;
    }
    if (received > stat.size) throw new Error(DOCUMENT_TOO_LARGE);
    const document = bytes.subarray(0, received);
    if (repositoryDocumentKind(file) === "docx") await validateDocxArchive(document);
    return new Uint8Array(document);
  } finally {
    await handle.close();
  }
};
