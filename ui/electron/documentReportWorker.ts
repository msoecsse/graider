import { parentPort, workerData } from "node:worker_threads";
import { extractReportDocument } from "./documentReportExtraction.js";
const request = workerData as { root: string; file: string };
void extractReportDocument(request.root, request.file).then((content) =>
  parentPort?.postMessage(content)
);
