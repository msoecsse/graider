import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPreloadPath, getRendererDevServerUrl, getRendererEntry } from "./rendererPaths.js";

describe("renderer path helpers", () => {
  it("resolves packaged renderer assets relative to dist-electron", () => {
    const baseDirectory = path.join(
      "Users",
      "sean",
      "Graider.app",
      "Contents",
      "Resources",
      "app.asar",
      "dist-electron"
    );

    expect(getPreloadPath(baseDirectory)).toBe(path.join(baseDirectory, "preload.js"));
    expect(getRendererEntry(baseDirectory)).toBe(
      path.join(
        "Users",
        "sean",
        "Graider.app",
        "Contents",
        "Resources",
        "app.asar",
        "dist",
        "index.html"
      )
    );
  });

  it("uses the dev server only when VITE_DEV_SERVER_URL is set", () => {
    expect(getRendererDevServerUrl({})).toBeUndefined();
    expect(getRendererDevServerUrl({ VITE_DEV_SERVER_URL: "   " })).toBeUndefined();
    expect(getRendererDevServerUrl({ VITE_DEV_SERVER_URL: " http://127.0.0.1:5173 " })).toBe(
      "http://127.0.0.1:5173"
    );
  });
});
