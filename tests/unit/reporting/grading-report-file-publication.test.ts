import { describe, expect, it, vi } from "vitest";
import {
  PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE,
  publishGraiderOwnedStudentReportFile,
  resolveGraiderGeneratedStudentReportDestination
} from "../../../src/reporting/student-report-publisher.js";

describe("Graider-owned student report publication", () => {
  it("uses the configured destination or canonical HTML default for generated and both modes", () => {
    expect(
      resolveGraiderGeneratedStudentReportDestination({
        enabled: true,
        mode: "graider-generated",
        destination_file: "grading/final.html"
      })
    ).toEqual({ status: "success", path: "grading/final.html" });
    expect(
      resolveGraiderGeneratedStudentReportDestination({
        enabled: true,
        mode: "both",
        graider_report_destination: "grading/graider-report.html"
      })
    ).toEqual({ status: "success", path: "grading/graider-report.html" });
    expect(resolveGraiderGeneratedStudentReportDestination(undefined)).toEqual({
      status: "success",
      path: "grading/report.html"
    });
    expect(
      resolveGraiderGeneratedStudentReportDestination({ enabled: true, mode: "graider-generated" })
    ).toEqual({
      status: "success",
      path: "grading/report.html"
    });
    expect(
      resolveGraiderGeneratedStudentReportDestination({ enabled: true, mode: "both" })
    ).toEqual({
      status: "success",
      path: "grading/report.html"
    });
  });

  it("preserves every explicit Graider-generated report destination", () => {
    expect(
      resolveGraiderGeneratedStudentReportDestination({
        enabled: true,
        mode: "graider-generated",
        destination_file: "grading/report.md"
      })
    ).toEqual({ status: "success", path: "grading/report.md" });
    expect(
      resolveGraiderGeneratedStudentReportDestination({
        enabled: true,
        mode: "graider-generated",
        destination_file: "feedback/index.html"
      })
    ).toEqual({ status: "success", path: "feedback/index.html" });
    expect(
      resolveGraiderGeneratedStudentReportDestination({
        enabled: true,
        mode: "both",
        graider_report_destination: "reports/student-feedback.html"
      })
    ).toEqual({ status: "success", path: "reports/student-feedback.html" });
  });

  it("rejects configurations without Graider ownership and unsafe destinations", () => {
    expect(
      resolveGraiderGeneratedStudentReportDestination({ enabled: false, mode: "disabled" })
    ).toEqual({ status: "report_destination_unavailable" });
    expect(
      resolveGraiderGeneratedStudentReportDestination({
        enabled: true,
        mode: "faculty-provided",
        destination_file: "grading/report.md"
      })
    ).toEqual({ status: "report_destination_unavailable" });
    for (const destination_file of [
      "../source.java",
      "/absolute/report.html",
      "grading/../../source.java",
      "grading\\report.html",
      "grading//report.html"
    ])
      expect(
        resolveGraiderGeneratedStudentReportDestination({
          enabled: true,
          mode: "graider-generated",
          destination_file
        })
      ).toEqual({ status: "unsafe_report_destination" });
  });

  it.each([null, "older report"])(
    "creates or updates the default HTML report with the CI-skip commit message",
    async (existingContent) => {
      const destination = resolveGraiderGeneratedStudentReportDestination(undefined);
      expect(destination).toEqual({ status: "success", path: "grading/report.html" });
      if (destination.status !== "success") throw new Error(destination.status);
      const writeRepositoryFile = vi.fn().mockResolvedValue({ path: destination.path });
      const client = {
        getRepositoryFileContent: vi.fn().mockResolvedValue(existingContent),
        writeRepositoryFile
      };
      const beforePublish = vi.fn().mockResolvedValue(true);

      await expect(
        publishGraiderOwnedStudentReportFile({
          githubClient: client,
          repository: { owner: "trusted-org", repo: "trusted-repo", branch: "main" },
          path: destination.path,
          html: "<!doctype html><p>trusted</p>",
          beforePublish
        })
      ).resolves.toEqual({ status: "published", writePerformed: true });
      expect(writeRepositoryFile).toHaveBeenCalledWith({
        owner: "trusted-org",
        repo: "trusted-repo",
        branch: "main",
        path: "grading/report.html",
        content: "<!doctype html><p>trusted</p>",
        message: "Publish Graider grading report [skip ci]"
      });
      expect(PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE).toBe(
        "Publish Graider grading report [skip ci]"
      );
    }
  );

  it("does not write when deterministic remote content is byte-identical", async () => {
    const writeRepositoryFile = vi.fn();
    const beforePublish = vi.fn().mockResolvedValue(true);
    const result = await publishGraiderOwnedStudentReportFile({
      githubClient: {
        getRepositoryFileContent: vi.fn().mockResolvedValue("same"),
        writeRepositoryFile
      },
      repository: { owner: "trusted-org", repo: "trusted-repo", branch: "main" },
      path: "grading/report.md",
      html: "same",
      beforePublish
    });

    expect(result).toEqual({ status: "published", writePerformed: false });
    expect(beforePublish).toHaveBeenCalledOnce();
    expect(writeRepositoryFile).not.toHaveBeenCalled();
  });

  it("aborts before either write or no-op success when the report basis became stale", async () => {
    const writeRepositoryFile = vi.fn();
    const result = await publishGraiderOwnedStudentReportFile({
      githubClient: {
        getRepositoryFileContent: vi.fn().mockResolvedValue("old"),
        writeRepositoryFile
      },
      repository: { owner: "trusted-org", repo: "trusted-repo", branch: "main" },
      path: "grading/report.md",
      html: "new",
      beforePublish: vi.fn().mockResolvedValue(false)
    });

    expect(result).toEqual({ status: "stale" });
    expect(writeRepositoryFile).not.toHaveBeenCalled();
  });
});
