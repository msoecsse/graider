import path from "node:path";
import { Worker } from "node:worker_threads";
import { DOCUMENT_LIMITS } from "./repositoryDocumentPolicy.js";
import type { DocumentContent, ReportDocument } from "../../src/shared/document-content.js";

interface DocumentReportWorker {
  once(event: "message", listener: (content: DocumentContent) => void): unknown;
  once(event: "error" | "exit", listener: () => void): unknown;
  terminate(): Promise<number>;
}
const unavailable: DocumentContent = {
  status: "unavailable",
  message:
    "This document could not be included safely because processing exceeded document safety limits."
};
export const extractRequiredReportDocuments = async (
  root: string,
  files: readonly string[],
  createWorker: (file: string) => DocumentReportWorker = (file) =>
    new Worker(path.join(__dirname, "documentReportWorker.mjs"), {
      workerData: { root, file },
      resourceLimits: { maxOldGenerationSizeMb: DOCUMENT_LIMITS.reportWorkerMemoryMb }
    })
): Promise<ReportDocument[]> => {
  const documents: ReportDocument[] = [];
  // Sequential workers bound peak memory across an assignment's required files.
  for (const file of files) {
    const content = await new Promise<DocumentContent>((resolve) => {
      const worker = createWorker(file);
      const timer = setTimeout(() => {
        void worker.terminate();
        resolve(unavailable);
      }, DOCUMENT_LIMITS.processingMilliseconds);
      worker.once("message", (result: DocumentContent) => {
        clearTimeout(timer);
        void worker.terminate();
        resolve(result);
      });
      worker.once("error", () => {
        clearTimeout(timer);
        resolve(unavailable);
      });
      worker.once("exit", () => {
        clearTimeout(timer);
        resolve(unavailable);
      });
    }).catch(() => unavailable);
    documents.push({ file, content });
  }
  return documents;
};
