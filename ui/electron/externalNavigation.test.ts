import { describe, expect, it, vi } from "vitest";
import { isTrustedGitHubWebUrl, registerExternalNavigation } from "./externalNavigation.js";

describe("external navigation", () => {
  it("opens GitHub web links externally and denies an Electron window", () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const setWindowOpenHandler = vi.fn();
    const on = vi.fn();
    const contents = { setWindowOpenHandler, on, getURL: () => "file:///app/index.html" };
    registerExternalNavigation({ webContents: contents } as never, { openExternal });

    const handler = setWindowOpenHandler.mock.calls[0]?.[0] as
      | ((details: { url: string }) => { action: string })
      | undefined;
    expect(handler?.({ url: "https://github.com/course/repo/actions/runs/42" })).toEqual({
      action: "deny"
    });
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(
      "https://github.com/course/repo/actions/runs/42"
    );

    const [eventName, navigateHandler] = on.mock.calls[0] ?? [];
    expect(eventName).toBe("will-navigate");
    const preventDefault = vi.fn();
    (navigateHandler as (event: { preventDefault: () => void }, url: string) => void)(
      { preventDefault },
      "https://github.com/course/repo"
    );
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledTimes(2);
  });

  it("rejects unsafe schemes and non-GitHub hosts", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,hello",
      "https://github.com.evil.test/course/repo",
      "https://user@github.com/course/repo",
      "http://github.com/course/repo"
    ]) {
      expect(isTrustedGitHubWebUrl(url)).toBe(false);
    }
  });

  it("keeps navigation within the current Graider document working", () => {
    const openExternal = vi.fn();
    const on = vi.fn();
    const contents = {
      setWindowOpenHandler: vi.fn(),
      on,
      getURL: () => "http://127.0.0.1:5173/"
    };
    registerExternalNavigation({ webContents: contents } as never, { openExternal });
    const handler = on.mock.calls[0]?.[1] as
      | ((event: { preventDefault: () => void }, url: string) => void)
      | undefined;
    const preventDefault = vi.fn();
    handler?.({ preventDefault }, "http://127.0.0.1:5173/assignment/detail");

    expect(preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("does not launch untrusted new-window destinations", () => {
    const openExternal = vi.fn();
    const setWindowOpenHandler = vi.fn();
    registerExternalNavigation(
      {
        webContents: {
          setWindowOpenHandler,
          on: vi.fn(),
          getURL: () => "file:///app/index.html"
        }
      } as never,
      { openExternal }
    );
    const handler = setWindowOpenHandler.mock.calls[0]?.[0] as
      | ((details: { url: string }) => { action: string })
      | undefined;

    expect(handler?.({ url: "javascript:alert(1)" })).toEqual({ action: "deny" });
    expect(handler?.({ url: "https://example.com/" })).toEqual({ action: "deny" });
    expect(openExternal).not.toHaveBeenCalled();
  });
});
