import { describe, expect, it } from "vitest";
import type { CourseFolderDashboardResult } from "../../electron/ipc";
import { aggregateDashboardResults } from "./dashboardAggregation";

const createResult = (
  courseFolderId: string,
  courseFolderPath: string,
  cards: readonly unknown[],
  status: "success" | "failure" = "success"
): CourseFolderDashboardResult => ({
  courseFolderId,
  courseFolderPath,
  status,
  dashboard: {
    schemaVersion: 1,
    commandName: "dashboard",
    status: status === "success" ? "success" : "partial_success",
    exitCode: status === "success" ? 0 : 1,
    diagnostics: [],
    summary: { cardCount: cards.length },
    cards
  },
  error: null,
  refreshedAt: "2026-06-10T12:00:00.000Z"
});

describe("dashboardAggregation", () => {
  it("combines cards from multiple folder results and preserves source metadata", () => {
    const aggregated = aggregateDashboardResults({
      "course-folder-csc1120": createResult("course-folder-csc1120", "/courses/csc1120", [
        { displayName: "27s1-csc1120", courseSlug: "csc1120", termSlug: "27s1" }
      ]),
      "course-folder-csc4641": createResult("course-folder-csc4641", "/courses/csc4641", [
        { displayName: "27s1-csc4641", courseSlug: "csc4641", termSlug: "27s1" }
      ])
    });

    expect(aggregated.cards).toHaveLength(2);
    expect(aggregated.cards[0]).toMatchObject({
      sourceFolderId: "course-folder-csc1120",
      sourceFolderPath: "/courses/csc1120",
      dashboardStatus: "success"
    });
    expect(aggregated.cards[1]).toMatchObject({
      sourceFolderId: "course-folder-csc4641",
      sourceFolderPath: "/courses/csc4641"
    });
  });

  it("keeps folder failures as errors while preserving other cards", () => {
    const aggregated = aggregateDashboardResults({
      "course-folder-csc1120": createResult("course-folder-csc1120", "/courses/csc1120", [
        { displayName: "27s1-csc1120" }
      ]),
      "course-folder-csc4641": {
        courseFolderId: "course-folder-csc4641",
        courseFolderPath: "/courses/csc4641",
        status: "failure",
        dashboard: null,
        error: {
          code: "graider_cli_not_found",
          message: "secret-token-value",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        refreshedAt: null
      }
    });

    expect(aggregated.cards).toHaveLength(1);
    expect(aggregated.folderErrors).toEqual([
      {
        sourceFolderId: "course-folder-csc4641",
        sourceFolderPath: "/courses/csc4641",
        code: "graider_cli_not_found",
        message:
          "Graider CLI not found. Install Graider or make sure graider is available on PATH.",
        details: ["Course folder: /courses/csc4641"]
      }
    ]);
    expect(JSON.stringify(aggregated)).not.toContain("secret-token-value");
  });

  it("includes safe dashboard command failure details", () => {
    const courseFolderPath = "/Users/sean/Box Sync/WebstormProjects/graider-sandbox/csc1120";
    const aggregated = aggregateDashboardResults({
      "course-folder-csc1120": {
        courseFolderId: "course-folder-csc1120",
        courseFolderPath,
        status: "failure",
        dashboard: null,
        error: {
          code: "dashboard_command_failed",
          message: "failed",
          exitCode: 1,
          stdoutSnippet: "stdout",
          stderrSnippet: "stderr",
          commandName: "dashboard",
          cwd: courseFolderPath,
          argv: ["graider", "dashboard", "--json"],
          runnerMode: "bundled",
          executablePath: "/Applications/Graider.app/Contents/MacOS/Graider",
          helperPath:
            "/Applications/Graider.app/Contents/Resources/app.asar.unpacked/dist-graider-cli/index.js",
          signal: null
        },
        refreshedAt: null
      }
    });

    expect(aggregated.folderErrors[0]).toMatchObject({
      message:
        "Dashboard command failed while reading this course folder. The selected folder exists and contains course.yml, but the Graider CLI returned an error.",
      details: [
        "Command: dashboard",
        `Course folder: ${courseFolderPath}`,
        "Exit code: 1",
        "Runner mode: bundled",
        "Executable: /Applications/Graider.app/Contents/MacOS/Graider",
        "Helper: /Applications/Graider.app/Contents/Resources/app.asar.unpacked/dist-graider-cli/index.js",
        'Argv: ["graider","dashboard","--json"]',
        "stderr: stderr",
        "stdout: stdout"
      ]
    });
  });
});
