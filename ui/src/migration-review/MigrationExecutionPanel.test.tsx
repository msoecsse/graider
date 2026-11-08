import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import {
  MigrationActivityGate,
  MigrationExecutionPanel,
  MigrationHistoryReport
} from "./MigrationExecutionPanel";
import { CourseMigrationNotice, CourseMigrationReminder } from "./CourseMigrationNotice";
import type {
  MigrationExecutionState,
  MigrationHistory
} from "../../electron/migrationExecutionTypes";
const selector = "managed-course:101:700";
const state = (changes: Partial<MigrationExecutionState> = {}): MigrationExecutionState => ({
  selector,
  active: true,
  cancellable: true,
  phase: "validating",
  stages: [{ phase: "validating", status: "running" }],
  published: false,
  outcome: "running",
  action: "",
  refreshRequired: false,
  blockers: [],
  ...changes
});
const history = (changes: Partial<MigrationHistory> = {}): MigrationHistory => ({
  source: "a".repeat(40),
  checkpoint: "refs/tags/graider-migration-v1/source",
  publication: "b".repeat(40),
  migrationDate: "2026-11-08T12:00:00Z",
  reviewedAuthority: { fallbackAdministratorGithubUserId: 101, termCreationOrder: [] },
  currentAccess: "ready",
  journalRevision: "c".repeat(40),
  executionState: "current_plan",
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
  deferredWork: ["Preserved historical grading placement remains unknown"],
  evidence: [],
  reconciliation: null,
  ...changes
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  Object.assign(window.graiderUI, { migrationExecution: undefined });
});
it("uses backend cancellation state, step labels and accessible light-mode panels", async () => {
  const cancel = vi.fn(async () => state({ cancellable: false, phase: "publishing" }));
  Object.assign(window.graiderUI, { migrationExecution: { cancel } });
  const onState = vi.fn();
  const f = render(
    <MemoryRouter>
      <MigrationExecutionPanel state={state()} onState={onState} />
    </MemoryRouter>
  );
  expect(screen.getByRole("list", { name: "Migration progress" })).toHaveTextContent(
    "Validation — running"
  );
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel upgrade" }));
  await waitFor(() => expect(cancel).toHaveBeenCalledWith({ selector }));
  f.rerender(
    <MemoryRouter>
      <MigrationExecutionPanel
        state={state({ cancellable: false, phase: "publishing" })}
        onState={onState}
      />
    </MemoryRouter>
  );
  expect(screen.getByRole("button", { name: "Cancel upgrade" })).toBeDisabled();
  expect(screen.getByText(/Cancellation is no longer available/)).toBeVisible();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Upgrading course" }).closest("section")).toHaveClass(
    "detail-panel"
  );
});
it.each([
  ["ready", true, "Ready"],
  ["needs_attention", true, "Published — Needs attention"],
  ["not_published", false, "Not published"]
] as const)(
  "renders %s without confusing publication and reconciliation",
  (outcome, published, title) => {
    render(
      <MemoryRouter>
        <MigrationExecutionPanel
          state={state({ active: false, cancellable: false, outcome, published })}
          onState={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByRole("link", { name: "Return to course overview" })).toHaveAttribute(
      "href",
      "/"
    );
  }
);
it("blocks all app routes after reload while backend migration is active, and restores navigation when safe", async () => {
  vi.useFakeTimers();
  let current: MigrationExecutionState | null = state({ phase: "publishing", cancellable: false });
  Object.assign(window.graiderUI, {
    migrationExecution: {
      active: vi.fn(async () => current),
      status: vi.fn(async () =>
        state({ active: false, outcome: "ready", published: true, cancellable: false })
      )
    }
  });
  render(
    <MemoryRouter>
      <MigrationActivityGate>
        <a href="#/other">Application navigation</a>
      </MigrationActivityGate>
    </MemoryRouter>
  );
  await act(async () => {});
  expect(screen.queryByText("Application navigation")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel upgrade" })).toBeDisabled();
  current = null;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(750);
  });
  expect(screen.queryByText("Application navigation")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Ready" })).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Return to course overview" }));
  expect(screen.getByText("Application navigation")).toBeVisible();
});
it("keeps the upgrade entry after reminder dismissal and preserves a permanent report with deferred findings", async () => {
  const f = render(<CourseMigrationReminder selector={selector} code="COURSE" />);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss upgrade reminder for COURSE" }));
  expect(screen.getByRole("link", { name: "Review migration — COURSE" })).toBeVisible();
  f.unmount();
  render(<CourseMigrationReminder selector={selector} code="COURSE" />);
  expect(
    screen.queryByRole("button", { name: "Dismiss upgrade reminder for COURSE" })
  ).not.toBeInTheDocument();
  render(<MigrationHistoryReport history={history()} />);
  expect(
    screen.getByText("Preserved historical grading placement remains unknown", { selector: "li" })
  ).toBeVisible();
  expect(screen.getByText(history().checkpoint)).toBeVisible();
  expect(screen.getByText(history().publication)).toBeVisible();
  expect(screen.getByText(/not an automatic rollback/)).toBeVisible();
  expect(screen.getByText("Technical details").closest("details")).not.toHaveAttribute("open");
});
it("shows upgrade completion once and keeps Needs attention persistent from backend current access", async () => {
  const inspect = vi.fn(async () => history());
  Object.assign(window.graiderUI, { migrationExecution: { history: inspect } });
  const f = render(<CourseMigrationNotice selector={selector} />);
  await screen.findByText(/Course upgrade complete/);
  f.unmount();
  const next = render(<CourseMigrationNotice selector={selector} />);
  await waitFor(() => expect(inspect).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/Course upgrade complete/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Course Settings"));
  expect(screen.getByRole("link", { name: "Migration History" })).toBeVisible();
  next.unmount();
  inspect.mockResolvedValue(history({ currentAccess: "needs_attention" }));
  render(<CourseMigrationNotice selector={selector} />);
  await screen.findByText(/Published — Needs attention/);
  expect(screen.getByRole("link", { name: "Review migration recovery" })).toBeVisible();
});
