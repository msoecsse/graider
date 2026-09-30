import { describe, expect, it } from "vitest";
import { createRosterSectionSummaryService } from "./rosterSectionSummaryService.js";

describe("roster section summary service", () => {
  it("passes only the backend's course and term identity through the CJS boundary", () => {
    const resolveRosterSectionSummariesContext = (request: {
      readonly courseFolderPath: string;
      readonly termCode: string;
    }) => {
      expect(request).toEqual({ courseFolderPath: "/trusted/course", termCode: "27s1" });
      return { status: "ready" as const, summaries: [], diagnostics: [] as const };
    };
    const service = createRosterSectionSummaryService({
      backend: { resolveRosterSectionSummariesContext }
    });

    expect(
      service({ courseFolderId: "course", courseFolderPath: "/trusted/course", termCode: "27s1" })
    ).toEqual({ status: "ready", summaries: [], diagnostics: [] });
  });
});
