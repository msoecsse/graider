import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { MigrationReviewPage } from "./MigrationReviewPage";
import {
  migrationViewFixture,
  reviewedSubmissionFixture,
  graderContextFixture
} from "../../electron/migrationReviewFixtures";
import { loadMigrationReviewBackend } from "../../electron/migrationReviewService";
const setup = () => {
  const view = migrationViewFixture();
  const backend = loadMigrationReviewBackend();
  const context = graderContextFixture();
  const review = {
    load: vi.fn(async () => ({
      status: "ready",
      view,
      message: null,
      savedSubmission: reviewedSubmissionFixture(view)
    })),
    close: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    saveGrader: vi.fn(async () => {}),
    complete: vi.fn(async (request) => backend.validateMigrationReview(view, request.submission)),
    loadGrader: vi.fn(async () => context),
    completeGrader: vi.fn(async (request) =>
      backend.reviewGraderAccess(context, request.submission)
    )
  };
  const execution = {
    start: vi.fn(async () => ({
      selector: view.selector,
      active: false,
      cancellable: false,
      phase: "validating",
      stages: [],
      outcome: "not_published",
      published: false,
      action:
        "Production migration is disabled. Update Graider when compatible production releases become available.",
      refreshRequired: false,
      blockers: [
        {
          code: "production_release_unproven",
          location: "windowsX64",
          action:
            "Wait for compatible macOS arm64 and Windows x64 production releases and check the course again."
        }
      ]
    }))
  };
  Object.assign(window.graiderUI, { migrationReview: review, migrationExecution: execution });
  const mounted = render(
    <MemoryRouter>
      <MigrationReviewPage selector={view.selector} />
    </MemoryRouter>
  );
  return { view, review, execution, mounted };
};
afterEach(() => {
  Object.assign(window.graiderUI, { migrationExecution: undefined });
});
it("shows the overview on every entry and Check course alone starts read-only analysis", async () => {
  const f = setup();
  expect(screen.getByRole("heading", { name: "Migration overview" })).toBeVisible();
  expect(f.review.load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check course" }));
  await screen.findByText(/Analyzed revision/);
  expect(f.execution.start).not.toHaveBeenCalled();
  f.mounted.unmount();
  render(
    <MemoryRouter>
      <MigrationReviewPage selector={f.view.selector} />
    </MemoryRouter>
  );
  expect(screen.getByRole("heading", { name: "Migration overview" })).toBeVisible();
  expect(f.review.load).toHaveBeenCalledTimes(1);
});
it("requires completed current reviews, shows access-loss warning, and sends one explicit confirmation", async () => {
  const f = setup();
  fireEvent.click(screen.getByRole("button", { name: "Check course" }));
  await screen.findByText(/Analyzed revision/);
  fireEvent.click(screen.getByRole("button", { name: "Final summary" }));
  expect(screen.getByRole("button", { name: "Upgrade course" })).toBeDisabled();
  expect(
    screen.getByText(/Faculty using incompatible Graider clients will lose access/)
  ).toBeVisible();
  const confirmation = screen.getByRole("region", { name: "Final migration confirmation" });
  expect(within(confirmation).queryByRole("checkbox")).not.toBeInTheDocument();
  expect(within(confirmation).queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  fireEvent.click(screen.getByRole("button", { name: "Complete migration review" }));
  await screen.findByRole("heading", { name: "Review result: complete" });
  fireEvent.click(screen.getByRole("button", { name: "Legacy grader access" }));
  fireEvent.click(screen.getByRole("button", { name: "Load grader inventory" }));
  await screen.findByLabelText("Disposition for faculty-now");
  fireEvent.change(screen.getByLabelText("Disposition for faculty-now"), {
    target: { value: "existing_sufficient" }
  });
  fireEvent.change(screen.getByLabelText("Disposition for new-faculty"), {
    target: { value: "no_access" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Complete grader access review" }));
  await screen.findByText(/Grader access review: complete/);
  fireEvent.click(screen.getByRole("button", { name: "Final summary" }));
  const button = screen.getByRole("button", { name: "Upgrade course" });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByRole("heading", { name: "Not published" });
  expect(f.execution.start).toHaveBeenCalledTimes(1);
  expect(f.execution.start).toHaveBeenCalledWith({
    sessionId: f.view.sessionId,
    source: backendSource(f.view.analysis),
    confirmed: true
  });
  expect(screen.getByText(/Wait for compatible macOS arm64/)).toBeVisible();
});
const backendSource = loadMigrationReviewBackend().migrationReviewSource;
it("autosaves decisions while editing and flushes before closing the review", async () => {
  const f = setup();
  fireEvent.click(screen.getByRole("button", { name: "Check course" }));
  await screen.findByText(/Analyzed revision/);
  fireEvent.click(screen.getByRole("button", { name: "Course authority" }));
  fireEvent.change(screen.getByLabelText("Fallback administrator"), { target: { value: "" } });
  f.mounted.unmount();
  await waitFor(() => expect(f.review.save).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(f.review.close).toHaveBeenCalledTimes(1));
  expect(f.review.save.mock.invocationCallOrder[0]).toBeLessThan(
    f.review.close.mock.invocationCallOrder[0]!
  );
});
