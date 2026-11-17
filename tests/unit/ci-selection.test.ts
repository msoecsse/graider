import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import {
  fullSelection,
  gateFailures,
  parseChanges,
  REGRESSION_JOBS,
  selectChanges
} from "../../scripts/ci/selection.js";

describe("conservative CI selection", () => {
  it("keeps documentation on fast feedback", () => {
    expect(
      Object.values(selectChanges([{ status: "M", path: "docs/migration-regression.md" }]).jobs)
    ).not.toContain(true);
  });
  it("selects focused renderer tests for a narrow UI leaf", () => {
    const result = selectChanges([
      { status: "M", path: "ui/src/roster-manager/RosterManagerPage.tsx" }
    ]);
    expect(result.related).toEqual(["ui/src/roster-manager/RosterManagerPage.tsx"]);
    expect(Object.values(result.jobs)).not.toContain(true);
  });
  it("keeps a root unit test focused", () => {
    const result = selectChanges([{ status: "M", path: "tests/unit/report-renderer.test.ts" }]);
    expect(result.related).toHaveLength(1);
    expect(result.jobs.root).toBe(false);
  });
  it.each([
    "src/reporting/faculty-csv-renderer.ts",
    "src/shared/comment-content.ts",
    "src/migration/migration-git.ts",
    "ui/electron/githubOAuth.ts",
    "src/git/git-workspace.ts",
    "package.json",
    "ui/package-lock.json",
    "vitest.config.ts",
    ".github/workflows/ci.yml",
    "tests/fixtures/gui/SmokeTest.java",
    "tests/helpers/grading-artifact.ts",
    "new-unknown.file",
    "ui/src/components/Notice.tsx",
    "ui/src/test/setup.ts"
  ])("fails full for shared/backend/configuration/unknown input %s", (file) => {
    expect(Object.values(selectChanges([{ status: "M", path: file }]).jobs)).toEqual(
      REGRESSION_JOBS.map(() => true)
    );
  });
  it.each([
    ["ui/src/apply-preview/ApplyPreviewPage.tsx", "apply"],
    ["ui/src/grading-workspace/GradingWorkspaceRoute.tsx", "grading"],
    ["ui/src/migration-review/MigrationReviewPage.tsx", "migration"],
    ["ui/src/course-setup/CourseSetupPage.tsx", "migration"],
    ["tests/unit/github/authority.test.ts", "migration"],
    ["tests/unit/workflows/java-gui.test.ts", "gui"]
  ])("retains native domain coverage for %s", (file, job) => {
    expect(
      selectChanges([{ status: "M", path: file }]).jobs[
        job as keyof ReturnType<typeof selectChanges>["jobs"]
      ]
    ).toBe(true);
  });
  it("includes transitive cross-feature importer domains", () => {
    expect(
      selectChanges(
        [{ status: "M", path: "ui/src/roster-manager/model.ts" }],
        ["ui/src/migration-review/MigrationReviewPage.tsx"]
      ).jobs.migration
    ).toBe(true);
  });
  it("retains both rename endpoints, spaces, deletions and additions", () => {
    const changes = parseChanges(
      "D\0ui/src/migration-review/old name.tsx\0A\0ui/src/roster-manager/new name.tsx\0"
    );
    expect(changes).toHaveLength(2);
    expect(Object.values(selectChanges(changes).jobs)).not.toContain(false);
    expect(
      Object.values(selectChanges([{ status: "D", path: "tests/unit/simple.test.ts" }]).jobs)
    ).not.toContain(false);
  });
  it.each(["M\0file", "R100\0old\0new\0", "X\0file\0", "M\0\0"])(
    "rejects unreliable diff data %j",
    (output) => {
      expect(() => parseChanges(output)).toThrow();
    }
  );
  it("fails full for an empty comparison", () => {
    expect(selectChanges([]).jobs).toEqual(fullSelection("fallback").jobs);
  });
});

describe("required CI gate", () => {
  const selected = Object.fromEntries(REGRESSION_JOBS.map((job) => [job, "true"]));
  const successful = Object.fromEntries(
    ["select", "fast", ...REGRESSION_JOBS].map((job) => [job, { result: "success" }])
  );
  it("accepts complete selected success", () => {
    expect(gateFailures(selected, successful)).toEqual([]);
  });
  it.each(["skipped", "failure", "cancelled"])("rejects selected %s", (result) => {
    expect(gateFailures(selected, { ...successful, migration: { result } })).toContain(
      `migration: ${result}`
    );
  });
  it("accepts only deliberately unselected skips", () => {
    expect(
      gateFailures(
        { ...selected, migration: "false" },
        { ...successful, migration: { result: "skipped" } }
      )
    ).toEqual([]);
    expect(gateFailures({}, successful)).not.toEqual([]);
  });
  it("rejects a failed selector or missing fast path", () => {
    expect(gateFailures(selected, { ...successful, select: { result: "failure" } })).toContain(
      "select: failure"
    );
    expect(gateFailures(selected, { ...successful, fast: { result: "skipped" } })).toContain(
      "fast: skipped"
    );
  });
  it("wires every optional job into the always-run gate without workflow path filters", () => {
    const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as {
      on: { push: Record<string, unknown>; pull_request: unknown; workflow_dispatch: unknown };
      jobs: Record<string, { needs?: string[]; if?: string; steps?: { run?: string }[] }>;
    };
    expect(workflow.on.push.paths).toBeUndefined();
    expect(workflow.on.workflow_dispatch).toBeDefined();
    expect(workflow.jobs.required?.if).toBe("${{ always() }}");
    expect(workflow.jobs.fast?.if).toBeUndefined();
    expect(
      workflow.jobs.fast?.steps?.some((step) => step.run?.includes("tests/architecture"))
    ).toBe(true);
    expect(
      workflow.jobs.fast?.steps?.some((step) => step.run?.includes("src/security-boundary.test.ts"))
    ).toBe(true);
    expect(workflow.jobs.required?.needs).toEqual(
      expect.arrayContaining(["select", "fast", ...REGRESSION_JOBS])
    );
    for (const job of REGRESSION_JOBS)
      expect(workflow.jobs[job]?.if).toBe(`\u0024{{ needs.select.outputs.${job} == 'true' }}`);
  });
});
