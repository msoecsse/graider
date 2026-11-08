import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { MigrationHistoryPage } from "./MigrationHistoryPage";
import type { MigrationHistory } from "../../electron/migrationExecutionTypes";
const selector = "managed-course:101:700";
const report = (executionState: MigrationHistory["executionState"]): MigrationHistory => ({
  source: "a".repeat(40),
  checkpoint: "refs/tags/graider-migration-v1/source",
  publication: "b".repeat(40),
  migrationDate: "2026-11-08T12:00:00Z",
  reviewedAuthority: { fallbackAdministratorGithubUserId: 101, termCreationOrder: [] },
  currentAccess: "needs_attention",
  journalRevision: "c".repeat(40),
  executionState,
  operationalReadiness: "unverified",
  reviewedIdentity: 101,
  review: {
    source: {
      repositoryId: 700,
      sourceCommitSha: "a".repeat(40),
      reportId: "d".repeat(64),
      authenticatedGithubUserId: 101
    },
    acknowledgements: [],
    grader_inventory_id: "inventory",
    member_decisions: []
  },
  reviewedRoles: [],
  findings: [],
  deferredWork: ["Preserved historical grading evidence"],
  evidence: [],
  reconciliation: null
});
const setup = (
  executionState: MigrationHistory["executionState"] = "current_plan",
  authorized = true
) => {
  const api = {
    history: vi.fn(async () => {
      if (!authorized) throw new Error("fictional-secret-provider-error");
      return report(executionState);
    }),
    retry: vi.fn(async () => ({
      selector,
      active: false,
      cancellable: false,
      phase: "reconciling",
      stages: [],
      outcome: "needs_attention",
      published: true,
      action: "Required access needs attention.",
      refreshRequired: false,
      blockers: []
    })),
    start: vi.fn()
  };
  Object.assign(window.graiderUI, { migrationExecution: api });
  render(
    <MemoryRouter initialEntries={[`/migration-history/${encodeURIComponent(selector)}`]}>
      <Routes>
        <Route path="/migration-history/:selector" element={<MigrationHistoryPage />} />
      </Routes>
    </MemoryRouter>
  );
  return api;
};
afterEach(() => Object.assign(window.graiderUI, { migrationExecution: undefined }));
it("explicit retry uses current backend state and never invokes migration publication", async () => {
  const api = setup();
  const button = await screen.findByRole("button", { name: "Verify and retry reconciliation" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(api.retry).toHaveBeenCalledTimes(1));
  expect(api.retry).toHaveBeenCalledWith({ selector });
  expect(api.start).not.toHaveBeenCalled();
  expect(await screen.findByRole("heading", { name: "Published — Needs attention" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to course overview" })).toBeVisible();
});
it("requires the explicit reviewed fresh-plan action after intervening course changes", async () => {
  const api = setup("fresh_plan_required");
  fireEvent.click(
    await screen.findByRole("button", { name: "Review current state and retry with a fresh plan" })
  );
  await waitFor(() => expect(api.retry).toHaveBeenCalledWith({ selector, freshPlan: true }));
  expect(api.start).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Verify and retry reconciliation" })
  ).not.toBeInTheDocument();
});
it("withholds history and recovery on authorization failure and exposes only actionable safe diagnostics", async () => {
  const api = setup("current_plan", false);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Migration history is unavailable for this account or course"
  );
  expect(screen.queryByRole("heading", { name: "Migration Report" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /retry/ })).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("fictional-secret-provider-error");
  expect(api.retry).not.toHaveBeenCalled();
});
