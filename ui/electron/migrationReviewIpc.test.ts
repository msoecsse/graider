import { describe, expect, it, vi } from "vitest";
import { registerMigrationReviewIpc } from "./migrationReviewIpc.js";
import { IPC_CHANNELS } from "./ipc.js";
import type { MigrationReviewService } from "./migrationReviewService.js";
import { migrationViewFixture, reviewedSubmissionFixture } from "./migrationReviewFixtures.js";
import { loadMigrationReviewBackend } from "./migrationReviewService.js";

describe("migration review IPC boundary", () => {
  const fixture = () => {
    const handlers = new Map<string, (event: unknown, request?: unknown) => unknown>();
    const ipc = {
      handle: vi.fn((channel: string, handler: (event: unknown, request?: unknown) => unknown) => {
        handlers.set(channel, handler);
      })
    };
    const service = {
      loadGrader: vi.fn(),
      completeGrader: vi.fn(),
      load: vi.fn(),
      refresh: vi.fn(),
      verify: vi.fn(),
      complete: vi.fn(),
      close: vi.fn()
    };
    registerMigrationReviewIpc(ipc as never, service as unknown as MigrationReviewService);
    const event = { sender: { id: 17, once: vi.fn() } };
    return {
      service,
      event,
      call: (channel: string, request?: unknown) => handlers.get(channel)?.(event, request)
    };
  };
  it("uses the Electron owner and strict selector/source DTOs", () => {
    const f = fixture();
    const view = migrationViewFixture();
    const bound = {
      sessionId: view.sessionId,
      source: loadMigrationReviewBackend().migrationReviewSource(view.analysis)
    };
    f.call(IPC_CHANNELS.loadMigrationReviewAnalysis, { selector: view.selector });
    expect(f.service.load).toHaveBeenCalledWith(f.event.sender.id, { selector: view.selector });
    f.call(IPC_CHANNELS.verifyMigrationFacultyIdentity, {
      ...bound,
      institutionalUsername: "prof",
      githubLogin: "faculty-now",
      addFaculty: false
    });
    expect(f.service.verify).toHaveBeenCalledWith(
      f.event.sender.id,
      expect.objectContaining({ githubLogin: "faculty-now" })
    );
    f.call(IPC_CHANNELS.loadGraderAccessReview, bound);
    expect(f.service.loadGrader).toHaveBeenCalledWith(f.event.sender.id, bound);
    f.call(IPC_CHANNELS.completeGraderAccessReview, {
      ...bound,
      submission: { inventoryId: "inventory", decisions: [] }
    });
    expect(f.service.completeGrader).toHaveBeenCalledWith(
      f.event.sender.id,
      expect.objectContaining({ submission: { inventoryId: "inventory", decisions: [] } })
    );
    expect(() =>
      f.call(IPC_CHANNELS.completeGraderAccessReview, {
        ...bound,
        submission: { inventoryId: "inventory", decisions: [], forged: true }
      })
    ).toThrow();
    f.call(IPC_CHANNELS.completeMigrationReview, {
      ...bound,
      submission: reviewedSubmissionFixture(view)
    });
    expect(f.service.complete).toHaveBeenCalledWith(
      f.event.sender.id,
      expect.objectContaining({ submission: expect.any(Object) })
    );
  });
  it.each([
    { courseFolderPath: "/arbitrary" },
    { selector: "managed-course:101:700", repositoryId: 700 },
    { selector: "course-name" }
  ])("rejects path and extra identity assertions: %j", (request) => {
    const f = fixture();
    expect(() => f.call(IPC_CHANNELS.loadMigrationReviewAnalysis, request)).toThrow();
    expect(f.service.load).not.toHaveBeenCalled();
  });
  it("rejects numeric faculty IDs and owner spoofing before calling service", () => {
    const f = fixture();
    const view = migrationViewFixture();
    const bound = {
      sessionId: view.sessionId,
      source: loadMigrationReviewBackend().migrationReviewSource(view.analysis)
    };
    expect(() =>
      f.call(IPC_CHANNELS.verifyMigrationFacultyIdentity, {
        ...bound,
        institutionalUsername: "prof",
        githubLogin: "faculty",
        addFaculty: false,
        githubUserId: 1
      })
    ).toThrow();
    expect(() => f.call(IPC_CHANNELS.refreshMigrationReview, { ...bound, owner: 2 })).toThrow();
    expect(f.service.verify).not.toHaveBeenCalled();
  });
  it("closes only the sender session on close or destruction", () => {
    const f = fixture();
    f.call(IPC_CHANNELS.loadMigrationReviewAnalysis, { selector: migrationViewFixture().selector });
    f.call(IPC_CHANNELS.closeMigrationReview);
    expect(f.service.close).toHaveBeenCalledWith(f.event.sender.id);
    const callback = f.event.sender.once.mock.calls[0]?.[1] as (() => void) | undefined;
    callback?.();
    expect(f.service.close).toHaveBeenCalledTimes(2);
  });
});
