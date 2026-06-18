import { describe, expect, it } from "vitest";
import { getGradeStatusRunUrl } from "./gradeStatusRunUrl";
import type { GradeStatusRepositoryRow } from "./gradeStatusTypes";

const BASE_ROW: GradeStatusRepositoryRow = {
  studentUsername: null,
  studentId: "s001",
  githubUsername: "ada",
  section: "001",
  repository: "graider-sandbox/csc1120-lab02-ada",
  workflow: ".github/workflows/grade.yml",
  ref: "main",
  runId: 123,
  runUrl: "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123",
  status: "completed",
  conclusion: "success",
  startedAt: "2026-06-10T12:00:00.000Z",
  completedAt: "2026-06-10T12:05:00.000Z",
  selectionStrategy: "latest_configured_workflow_run",
  reason: "success",
  needsAttention: false,
  diagnostics: []
};

const createRow = (overrides: Partial<GradeStatusRepositoryRow>): GradeStatusRepositoryRow => ({
  ...BASE_ROW,
  ...overrides
});

describe("getGradeStatusRunUrl", () => {
  it("uses a backend runUrl when it matches the student repository and run id", () => {
    expect(getGradeStatusRunUrl(BASE_ROW)).toBe(
      "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123"
    );
  });

  it("builds a run URL from full owner/repo and runId when runUrl is missing", () => {
    expect(getGradeStatusRunUrl(createRow({ runUrl: null, runId: 456 }))).toBe(
      "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/456"
    );
  });

  it("does not build a run URL when only a repository name is available", () => {
    expect(
      getGradeStatusRunUrl(createRow({ repository: "csc1120-lab02-ada", runUrl: null }))
    ).toBeNull();
  });

  it("rejects malformed and non-https URLs", () => {
    expect(getGradeStatusRunUrl(createRow({ runUrl: "not a url" }))).toBeNull();
    expect(getGradeStatusRunUrl(createRow({ runUrl: "javascript:alert(1)" }))).toBeNull();
    expect(getGradeStatusRunUrl(createRow({ runUrl: "file:///tmp/run.html" }))).toBeNull();
    expect(
      getGradeStatusRunUrl(
        createRow({ runUrl: "/graider-sandbox/csc1120-lab02-ada/actions/runs/123" })
      )
    ).toBeNull();
    expect(
      getGradeStatusRunUrl(
        createRow({
          runUrl: "http://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123"
        })
      )
    ).toBeNull();
  });

  it("rejects GitHub URLs without a run id", () => {
    expect(
      getGradeStatusRunUrl(
        createRow({ runUrl: "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs" })
      )
    ).toBeNull();
  });

  it("rejects run URLs for a different repository", () => {
    expect(
      getGradeStatusRunUrl(
        createRow({
          runUrl: "https://github.com/graider-sandbox/course-admin/actions/runs/123"
        })
      )
    ).toBeNull();
  });

  it("rejects run URLs with a different run id when row runId is known", () => {
    expect(
      getGradeStatusRunUrl(
        createRow({
          runId: 123,
          runUrl: "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/999"
        })
      )
    ).toBeNull();
  });
});
