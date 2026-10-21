import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_LIMITS } from "./repositoryDocumentPolicy.js";
import { extractRequiredReportDocuments } from "./documentReportService.js";
const workers: (EventEmitter & { terminate: ReturnType<typeof vi.fn> })[] = [];
const createWorker = () => {
  const worker = Object.assign(new EventEmitter(), { terminate: vi.fn().mockResolvedValue(0) });
  workers.push(worker);
  return worker;
};
afterEach(() => {
  vi.useRealTimers();
  workers.splice(0);
});
describe("bounded report document workers", () => {
  it("terminates timed-out work, contains errors, and advances sequentially", async () => {
    vi.useFakeTimers();
    const result = extractRequiredReportDocuments(
      "/trusted/repo",
      ["slow.pdf", "bad.docx", "good.pdf"],
      createWorker
    );
    expect(workers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(DOCUMENT_LIMITS.processingMilliseconds);
    expect(workers[0]?.terminate).toHaveBeenCalled();
    workers[1]?.emit("error", new Error("internal detail"));
    await vi.advanceTimersByTimeAsync(0);
    workers[2]?.emit("message", { status: "content", nodes: [{ text: "Readable" }] });
    const documents = await result;
    expect(documents.map((document) => document.content.status)).toEqual([
      "unavailable",
      "unavailable",
      "content"
    ]);
    expect(JSON.stringify(documents)).not.toContain("internal detail");
  });
});
