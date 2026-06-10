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
      removeCourseFolder: vi.fn().mockResolvedValue(undefined)
    }
  });
});
