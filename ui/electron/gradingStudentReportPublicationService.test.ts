import { describe, expect, it, vi } from "vitest";
import {
  createGradingStudentReportPublicationService,
  type PublishGradingStudentReportRequest
} from "./gradingStudentReportPublicationService.js";

const SHA = "a".repeat(40);
const request: PublishGradingStudentReportRequest = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada",
  userDataPath: "/trusted/user-data"
};
const authorized = {
  status: "success" as const,
  sections: ["001"],
  students: [{ studentId: "ada", githubUsername: "ada-gh", section: "001" }],
  errors: []
};
const prepared = {
  studentId: "ada",
  submissionCommitSha: SHA,
  reportPath: "grading/final.html",
  repository: { owner: "trusted-org", repo: "lab1-ada" },
  managedEvidenceEligible: true
};

const backend = () => ({
  checkGradingStudentReportPublicationEligibility: vi.fn().mockReturnValue({ status: "success" }),
  prepareGradingStudentReportPublicationContext: vi.fn().mockReturnValue({
    status: "success",
    value: prepared
  }),
  retrieveManagedEvidenceForGradingStudentReport: vi.fn().mockResolvedValue({
    status: "success",
    value: {
      evidence: {
        metadata: { submissionCommitSha: SHA }
      }
    }
  }),
  renderPreparedGradingStudentReport: vi.fn().mockReturnValue({
    status: "success",
    html: "<!doctype html><p>trusted report</p>"
  }),
  revalidatePreparedGradingStudentReportPublication: vi.fn().mockReturnValue({ status: "success" }),
  publishRenderedGradingStudentReport: vi.fn(
    async (
      _prepared: unknown,
      _html: string,
      _token: string,
      beforePublish: () => Promise<boolean>
    ) =>
      (await beforePublish())
        ? { status: "published" as const, writePerformed: true }
        : { status: "stale" as const }
  ),
  markPreparedGradingStudentReportPublished: vi.fn().mockReturnValue({
    status: "success",
    studentId: "ada",
    gradingStatus: "published"
  })
});

const dependencies = () => {
  const publicationBackend = backend();
  return {
    publicationBackend,
    values: {
      resolveFacultyScope: vi.fn().mockReturnValue(authorized),
      resolveRepository: vi
        .fn()
        .mockReturnValue({ status: "success", localPath: "/trusted/local/ada" }),
      readHead: vi.fn().mockResolvedValue({ status: "success", submissionCommitSha: SHA }),
      readHistory: vi.fn().mockResolvedValue({
        status: "success",
        commits: [{ sha: SHA, committedAt: "2026-09-11T12:00:00Z", message: "Submit" }]
      }),
      resolveToken: vi.fn().mockResolvedValue({ status: "success", token: "private-token" }),
      loadBackend: vi.fn().mockReturnValue(publicationBackend)
    }
  };
};

describe("grading student report publication Electron service", () => {
  it.each(["assigned faculty", "co-faculty"])(
    "publishes for %s using only trusted context, evidence, history, and repository",
    async () => {
      const { values, publicationBackend } = dependencies();
      const service = createGradingStudentReportPublicationService(values);

      await expect(service(request)).resolves.toEqual({
        status: "success",
        studentId: "ada",
        gradingStatus: "published",
        reportPath: "grading/final.html",
        remoteWrite: "created_or_updated",
        warnings: []
      });
      expect(values.resolveRepository).toHaveBeenCalledWith(request);
      expect(publicationBackend.prepareGradingStudentReportPublicationContext).toHaveBeenCalledWith(
        {
          courseFolderPath: "/trusted/course",
          termCode: "27s1",
          assignmentSlug: "lab1",
          studentId: "ada",
          repositoryRoot: "/trusted/local/ada",
          currentSubmissionCommitSha: SHA
        }
      );
      expect(values.readHistory).toHaveBeenCalledWith("/trusted/local/ada", SHA);
      expect(
        publicationBackend.retrieveManagedEvidenceForGradingStudentReport
      ).toHaveBeenCalledWith(prepared, "private-token");
      expect(publicationBackend.renderPreparedGradingStudentReport).toHaveBeenCalledWith(
        prepared,
        expect.objectContaining({ evidence: expect.anything(), commitHistory: expect.anything() })
      );
      expect(publicationBackend.publishRenderedGradingStudentReport).toHaveBeenCalledWith(
        prepared,
        "<!doctype html><p>trusted report</p>",
        "private-token",
        expect.any(Function)
      );
      expect(publicationBackend.markPreparedGradingStudentReportPublished).toHaveBeenCalled();
      expect(
        publicationBackend.publishRenderedGradingStudentReport.mock.invocationCallOrder[0]
      ).toBeLessThan(
        publicationBackend.markPreparedGradingStudentReportPublished.mock.invocationCallOrder[0]!
      );
    }
  );

  it("previews the same trusted rendered report without publishing or changing grading state", async () => {
    const { values, publicationBackend } = dependencies();
    values.readHistory.mockResolvedValue({ status: "commit_history_unavailable" });
    publicationBackend.retrieveManagedEvidenceForGradingStudentReport.mockResolvedValue({
      status: "failure",
      error: { code: "evidence_not_found" }
    });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request, "preview")).resolves.toEqual({
      status: "success",
      studentId: "ada",
      html: "<!doctype html><p>trusted report</p>",
      warnings: ["commit_history_unavailable", "automated_evidence_unavailable"]
    });
    expect(publicationBackend.renderPreparedGradingStudentReport).toHaveBeenCalledWith(
      prepared,
      {}
    );
    expect(
      publicationBackend.revalidatePreparedGradingStudentReportPublication
    ).not.toHaveBeenCalled();
    expect(publicationBackend.publishRenderedGradingStudentReport).not.toHaveBeenCalled();
    expect(publicationBackend.markPreparedGradingStudentReportPublished).not.toHaveBeenCalled();
  });

  it("denies inaccessible students before repository, state, token, or GitHub work", async () => {
    const { values } = dependencies();
    values.resolveFacultyScope.mockReturnValue({ ...authorized, students: [] });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toEqual({ status: "student_not_accessible" });
    expect(values.resolveRepository).not.toHaveBeenCalled();
    expect(values.readHead).not.toHaveBeenCalled();
    expect(values.loadBackend).not.toHaveBeenCalled();
    expect(values.resolveToken).not.toHaveBeenCalled();
  });

  it.each(["grading_not_complete", "grading_state_missing", "submission_changed"] as const)(
    "preserves trusted preparation failure %s without remote work",
    async (status) => {
      const { values, publicationBackend } = dependencies();
      if (status === "submission_changed")
        publicationBackend.prepareGradingStudentReportPublicationContext.mockReturnValue({
          status,
          studentId: "ada"
        });
      else
        publicationBackend.checkGradingStudentReportPublicationEligibility.mockReturnValue({
          status,
          studentId: "ada"
        });
      const service = createGradingStudentReportPublicationService(values);

      await expect(service(request)).resolves.toEqual({ status, studentId: "ada" });
      expect(values.resolveToken).not.toHaveBeenCalled();
      expect(publicationBackend.publishRenderedGradingStudentReport).not.toHaveBeenCalled();
      expect(publicationBackend.markPreparedGradingStudentReportPublished).not.toHaveBeenCalled();
      if (status !== "submission_changed") {
        expect(values.resolveRepository).not.toHaveBeenCalled();
        expect(values.readHead).not.toHaveBeenCalled();
      }
    }
  );

  it("returns local repository failure before HEAD, history, token, or remote publication", async () => {
    const { values, publicationBackend } = dependencies();
    values.resolveRepository.mockReturnValue({ status: "repository_not_recorded" });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toEqual({ status: "repository_not_recorded" });
    expect(values.readHead).not.toHaveBeenCalled();
    expect(values.readHistory).not.toHaveBeenCalled();
    expect(values.resolveToken).not.toHaveBeenCalled();
    expect(publicationBackend.publishRenderedGradingStudentReport).not.toHaveBeenCalled();
  });

  it("passes through safe trusted source/config preparation failures", async () => {
    const { values, publicationBackend } = dependencies();
    publicationBackend.prepareGradingStudentReportPublicationContext.mockReturnValue({
      status: "source_unavailable",
      studentId: "ada",
      code: "required_file_read_failed"
    });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toEqual({
      status: "source_unavailable",
      studentId: "ada",
      code: "required_file_read_failed"
    });
    expect(publicationBackend.publishRenderedGradingStudentReport).not.toHaveBeenCalled();
  });

  it("publishes custom-workflow reports without managed evidence retrieval", async () => {
    const { values, publicationBackend } = dependencies();
    publicationBackend.prepareGradingStudentReportPublicationContext.mockReturnValue({
      status: "success",
      value: { ...prepared, managedEvidenceEligible: false }
    });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toMatchObject({ status: "success", warnings: [] });
    expect(
      publicationBackend.retrieveManagedEvidenceForGradingStudentReport
    ).not.toHaveBeenCalled();
    expect(publicationBackend.renderPreparedGradingStudentReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ evidence: expect.anything() })
    );
  });

  it("continues without unavailable evidence/history and returns safe warnings", async () => {
    const { values, publicationBackend } = dependencies();
    values.readHistory.mockResolvedValue({ status: "commit_history_unavailable" });
    publicationBackend.retrieveManagedEvidenceForGradingStudentReport.mockResolvedValue({
      status: "failure",
      error: { code: "evidence_identity_mismatch" }
    });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toMatchObject({
      status: "success",
      warnings: ["commit_history_unavailable", "automated_evidence_invalid"]
    });
    expect(publicationBackend.renderPreparedGradingStudentReport).toHaveBeenCalledWith(
      prepared,
      {}
    );
  });

  it("drops a successful evidence payload whose anchored identity does not match", async () => {
    const { values, publicationBackend } = dependencies();
    publicationBackend.retrieveManagedEvidenceForGradingStudentReport.mockResolvedValue({
      status: "success",
      value: { evidence: { metadata: { submissionCommitSha: "c".repeat(40) } } }
    });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toMatchObject({
      status: "success",
      warnings: ["automated_evidence_invalid"]
    });
    expect(publicationBackend.renderPreparedGradingStudentReport).toHaveBeenCalledWith(
      prepared,
      expect.not.objectContaining({ evidence: expect.anything() })
    );
  });

  it("treats an identical report as successful without a duplicate write", async () => {
    const { values, publicationBackend } = dependencies();
    publicationBackend.publishRenderedGradingStudentReport.mockResolvedValue({
      status: "published",
      writePerformed: false
    });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toMatchObject({
      status: "success",
      gradingStatus: "published",
      remoteWrite: "unchanged"
    });
    expect(publicationBackend.publishRenderedGradingStudentReport).toHaveBeenCalledOnce();
  });

  it("returns a safe rendering failure without remote write or state transition", async () => {
    const { values, publicationBackend } = dependencies();
    publicationBackend.renderPreparedGradingStudentReport.mockReturnValue({
      status: "report_render_failed",
      code: "private_internal_detail"
    });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toEqual({ status: "report_render_failed" });
    expect(publicationBackend.publishRenderedGradingStudentReport).not.toHaveBeenCalled();
    expect(publicationBackend.markPreparedGradingStudentReportPublished).not.toHaveBeenCalled();
  });

  it("never marks published when a pre-write revalidation detects concurrent grading changes", async () => {
    const { values, publicationBackend } = dependencies();
    publicationBackend.revalidatePreparedGradingStudentReportPublication.mockReturnValue({
      status: "publication_stale",
      studentId: "ada"
    });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toEqual({
      status: "publication_stale",
      studentId: "ada",
      remoteReportPublished: false
    });
    expect(publicationBackend.publishRenderedGradingStudentReport).toHaveBeenCalledOnce();
    expect(publicationBackend.markPreparedGradingStudentReportPublished).not.toHaveBeenCalled();
  });

  it("does not overwrite newer state when it changes during the remote write", async () => {
    const { values, publicationBackend } = dependencies();
    publicationBackend.markPreparedGradingStudentReportPublished.mockReturnValue({
      status: "publication_stale",
      studentId: "ada"
    });
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toEqual({
      status: "publication_stale",
      studentId: "ada",
      remoteReportPublished: true
    });
    expect(publicationBackend.publishRenderedGradingStudentReport).toHaveBeenCalledOnce();
  });

  it("reports remote success plus local persistence failure and retries via deterministic no-op", async () => {
    const { values, publicationBackend } = dependencies();
    publicationBackend.markPreparedGradingStudentReportPublished.mockReturnValue({
      status: "publication_state_record_failed",
      studentId: "ada"
    });
    const service = createGradingStudentReportPublicationService(values);
    await expect(service(request)).resolves.toEqual({
      status: "publication_state_record_failed",
      studentId: "ada",
      reportPath: "grading/final.html",
      remoteReportPublished: true,
      warnings: []
    });

    publicationBackend.publishRenderedGradingStudentReport.mockResolvedValue({
      status: "published",
      writePerformed: false
    });
    publicationBackend.markPreparedGradingStudentReportPublished.mockReturnValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "published"
    });
    await expect(service(request)).resolves.toMatchObject({
      status: "success",
      remoteWrite: "unchanged"
    });
    expect(publicationBackend.publishRenderedGradingStudentReport).toHaveBeenCalledTimes(2);
  });

  it("maps Contents permission failure safely and leaves local state untouched", async () => {
    const { values, publicationBackend } = dependencies();
    publicationBackend.publishRenderedGradingStudentReport.mockResolvedValue({
      status: "report_write_permission_unavailable"
    } as never);
    const service = createGradingStudentReportPublicationService(values);

    await expect(service(request)).resolves.toEqual({
      status: "report_write_permission_unavailable"
    });
    expect(publicationBackend.markPreparedGradingStudentReportPublished).not.toHaveBeenCalled();
  });
});
