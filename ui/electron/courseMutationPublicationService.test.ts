import { describe, expect, it, vi } from "vitest";

import type { CourseSetupDiagnostic } from "./ipc";
import { publishSuccessfulCourseMutation } from "./courseMutationPublicationService";

const localSuccess = {
  status: "success" as const,
  path: "terms/27s1/assignments/lab01/assignment.yml",
  diagnostics: [] as readonly CourseSetupDiagnostic[]
};

describe("publishSuccessfulCourseMutation", () => {
  it("publishes after a successful local mutation", async () => {
    const publish = vi.fn().mockResolvedValue({
      status: "success",
      diagnostics: [],
      commitMessage: "Publish Graider course changes"
    });

    const result = await publishSuccessfulCourseMutation("/course", localSuccess, publish);

    expect(publish).toHaveBeenCalledWith("/course");
    expect(result).toMatchObject({ status: "success", publication: { status: "success" } });
  });

  it("keeps a successful local mutation durable when publication fails", async () => {
    const publish = vi.fn().mockResolvedValue({
      status: "failure",
      diagnostics: [{ message: "Push failed." }],
      commitMessage: null
    });

    const result = await publishSuccessfulCourseMutation("/course", localSuccess, publish);

    expect(result.status).toBe("success");
    expect(result.path).toBe(localSuccess.path);
    expect(result.publication).toMatchObject({ status: "failure" });
    expect(result.diagnostics.map((item) => item.message).join(" ")).toMatch(
      /saved locally, but could not be published/u
    );
  });

  it("does not publish when the local mutation fails", async () => {
    const publish = vi.fn();
    const result = await publishSuccessfulCourseMutation(
      "/course",
      { status: "failure" as const, diagnostics: [{ message: "Invalid assignment." }] },
      publish
    );

    expect(publish).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "failure",
      diagnostics: [{ message: "Invalid assignment." }]
    });
  });

  it("reports a thrown publication error without replacing local success", async () => {
    const result = await publishSuccessfulCourseMutation("/course", localSuccess, async () => {
      throw new Error("Network unavailable");
    });

    expect(result).toMatchObject({ status: "success", publication: { status: "failure" } });
    expect(result.diagnostics.map((item) => item.message).join(" ")).toMatch(
      /saved locally, but could not be published/u
    );
  });
});
