import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: {
      getAppInfo: vi.fn().mockResolvedValue({ name: "Graider", version: "0.1.0" }),
      selectCourseFolder: vi.fn().mockResolvedValue({ canceled: true, courseFolder: null }),
      listCourseFolders: vi.fn().mockResolvedValue([]),
      removeCourseFolder: vi.fn().mockResolvedValue(undefined),
      refreshCourseFolder: vi.fn().mockResolvedValue({
        courseFolderId: "course-folder-default",
        courseFolderPath: "/tmp/course",
        status: "success",
        dashboard: {
          schemaVersion: 1,
          commandName: "dashboard",
          status: "success",
          exitCode: 0,
          diagnostics: [],
          summary: { cardCount: 0 },
          cards: []
        },
        error: null,
        refreshedAt: "2026-06-10T12:00:00.000Z"
      }),
      refreshDashboard: vi.fn().mockResolvedValue({
        status: "success",
        results: []
      })
    }
  });
});
