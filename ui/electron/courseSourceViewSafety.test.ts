// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createCourseMutationIpc } from "./courseMutationIpc";
import { IPC_CHANNELS } from "./ipc";
import type { ManagedCourseMutationGuard } from "./managedCourseMutationGuard";

const fixture = () => {
  const handlers = new Map<string, Function>();
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn(),
    reload: vi.fn()
  });
  const guard = {
    run: vi.fn(async (_id, _path, _mode, operation) => operation()),
    updateSource: vi.fn(async (_id, beforeWrite) => beforeWrite())
  };
  const adapter = createCourseMutationIpc(
    {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      }
    },
    () => guard as unknown as ManagedCourseMutationGuard
  );
  return { handlers, sender, guard, adapter, event: { sender } };
};

describe("source update invalidates stale documents at the trusted write boundary", () => {
  it.each([IPC_CHANNELS.saveAssignmentEdit, IPC_CHANNELS.saveRoster])(
    "%s cannot save stale in-memory data after update; reload and fresh guard are required",
    async (channel) => {
      const f = fixture();
      const write = vi.fn();
      f.adapter.handle(channel, write);
      const oldForm = {
        courseFolderId: "legacy",
        assignmentTitle: "Old title",
        rows: [{ studentId: "old" }]
      };
      await f.handlers.get(IPC_CHANNELS.updateCourseSource)!(f.event, "legacy");
      expect(f.guard.updateSource).toHaveBeenCalledWith("legacy", expect.any(Function));
      expect(write).not.toHaveBeenCalled();
      await expect(f.handlers.get(channel)!(f.event, oldForm)).rejects.toMatchObject({
        result: { reason: "view_refresh_required", action: "refresh_view" }
      });
      expect(f.guard.run).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      await f.handlers.get(IPC_CHANNELS.reloadCourseView)!(f.event);
      expect(f.sender.reload).toHaveBeenCalledOnce();
      f.sender.emit("did-start-navigation", {}, "file:///app", false, true);
      f.sender.emit("did-finish-load");
      const currentForm = {
        courseFolderId: "legacy",
        assignmentTitle: "Remote title",
        rows: [{ studentId: "remote" }]
      };
      await f.handlers.get(channel)!(f.event, currentForm);
      expect(f.guard.run).toHaveBeenCalledOnce();
      expect(write).toHaveBeenCalledWith(f.event, currentForm);
    }
  );
  it("a mutation queued before update cannot run its handler after the update", async () => {
    const f = fixture();
    let resume!: () => Promise<void>;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.guard.run.mockImplementationOnce(async (_id, _path, _mode, operation) => {
      resume = operation;
      await waiting;
      return resume();
    });
    const write = vi.fn();
    f.adapter.handle(IPC_CHANNELS.saveRoster, write);
    const queued = f.handlers.get(IPC_CHANNELS.saveRoster)!(f.event, { courseFolderId: "legacy" });
    await f.handlers.get(IPC_CHANNELS.updateCourseSource)!(f.event, "legacy");
    release();
    await expect(queued).rejects.toMatchObject({ result: { reason: "view_refresh_required" } });
    expect(write).not.toHaveBeenCalled();
  });
  it("a reload during preparation does not clear the final invalidation", async () => {
    const f = fixture();
    f.guard.updateSource.mockImplementationOnce(async (_id, beforeWrite) => {
      beforeWrite();
      f.sender.emit("did-start-navigation", {}, "file:///app", false, true);
    });
    const write = vi.fn();
    f.adapter.handle(IPC_CHANNELS.saveRoster, write);
    await f.handlers.get(IPC_CHANNELS.updateCourseSource)!(f.event, "legacy");
    f.sender.emit("did-finish-load");
    await expect(
      f.handlers.get(IPC_CHANNELS.saveRoster)!(f.event, { courseFolderId: "legacy" })
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it("rejects renderer-supplied source parameters", async () => {
    const f = fixture();
    await expect(
      f.handlers.get(IPC_CHANNELS.updateCourseSource)!(f.event, {
        path: "/foreign",
        sha: "HEAD",
        branch: "other"
      })
    ).rejects.toThrow();
    expect(f.guard.updateSource).not.toHaveBeenCalled();
  });
});
