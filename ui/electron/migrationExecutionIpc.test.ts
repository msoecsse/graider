import { expect, it, vi } from "vitest";
import { registerMigrationExecutionIpc } from "./migrationExecutionIpc.js";
import { IPC_CHANNELS } from "./ipc.js";
import type { MigrationExecutionService } from "./migrationExecutionService.js";
const fixture = () => {
  const handlers = new Map<string, (event: unknown, request?: unknown) => unknown>();
  const service = {
    start: vi.fn(),
    active: vi.fn(),
    status: vi.fn(),
    cancel: vi.fn(),
    recover: vi.fn(),
    history: vi.fn(),
    retry: vi.fn()
  };
  registerMigrationExecutionIpc(
    {
      handle: (channel: string, handler: (event: unknown, request?: unknown) => unknown) => {
        handlers.set(channel, handler);
      }
    } as never,
    service as unknown as MigrationExecutionService
  );
  return {
    service,
    call: (channel: string, request?: unknown) =>
      handlers.get(channel)!({ sender: { id: 17 } }, request)
  };
};
const bound = {
  sessionId: "retained-session",
  source: {
    repositoryId: 700,
    sourceCommitSha: "a".repeat(40),
    reportId: "report",
    authenticatedGithubUserId: 101
  }
};
it("takes owner only from Electron and forwards single explicit confirmation", () => {
  const f = fixture();
  f.call(IPC_CHANNELS.startMigration, { ...bound, confirmed: true });
  expect(f.service.start).toHaveBeenCalledWith(17, { ...bound, confirmed: true });
  f.call(IPC_CHANNELS.migrationHistory, { selector: "managed-course:101:700" });
  expect(f.service.history).toHaveBeenCalledWith({ selector: "managed-course:101:700" });
});
it.each([
  { ...bound },
  { ...bound, confirmed: false },
  { ...bound, confirmed: true, owner: 1 },
  { ...bound, confirmed: true, compatibility: { operationalSchema: 2 } },
  { ...bound, confirmed: true, plan: {} },
  { ...bound, confirmed: true, publicationReady: true }
])("rejects missing acknowledgement and forged renderer authority: %j", (request) => {
  const f = fixture();
  expect(() => f.call(IPC_CHANNELS.startMigration, request)).toThrow();
  expect(f.service.start).not.toHaveBeenCalled();
});
it("accepts only an explicit fresh-plan intent, never a renderer plan or historical review", () => {
  const f = fixture();
  f.call(IPC_CHANNELS.retryMigrationReconciliation, {
    selector: "managed-course:101:700",
    freshPlan: true
  });
  expect(f.service.retry).toHaveBeenCalledWith({
    selector: "managed-course:101:700",
    freshPlan: true
  });
  for (const extra of [
    { plan: {} },
    { ready: true },
    { review: bound },
    { freshPlan: false },
    { courseFolderPath: "anything" }
  ])
    expect(() =>
      f.call(IPC_CHANNELS.retryMigrationReconciliation, {
        selector: "managed-course:101:700",
        ...extra
      })
    ).toThrow();
  expect(() => f.call(IPC_CHANNELS.activeMigration, { userId: 101 })).toThrow();
});
