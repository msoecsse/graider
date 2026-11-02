import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { MigrationReviewPage } from "./MigrationReviewPage";
import {
  migrationViewFixture,
  migrationSnapshotFixture,
  extraTermFixture,
  REVIEW_SELECTOR,
  REVIEW_USER,
  REVIEW_NEW_SHA
} from "../../electron/migrationReviewFixtures";
import {
  loadMigrationReviewBackend,
  type MigrationReviewApi,
  type MigrationReviewSessionView
} from "../../electron/migrationReviewService";

const setup = (initial = migrationViewFixture()) => {
  let view = initial;
  const backend = loadMigrationReviewBackend();
  const api = {
    load: vi.fn(async () => ({ status: "ready" as const, view, message: null })),
    refresh: vi.fn(async () => ({
      status: "ready" as const,
      view,
      message: "Analysis refreshed. Review again."
    })),
    verify: vi.fn(async () => ({
      status: "ready" as const,
      view,
      message: "GitHub identity verified. Review selections were reset."
    })),
    complete: vi.fn(async (request: Parameters<MigrationReviewApi["complete"]>[0]) =>
      backend.validateMigrationReview(view, request.submission)
    ),
    close: vi.fn(async () => {})
  };
  Object.assign(window.graiderUI, { migrationReview: api });
  render(
    <MemoryRouter>
      <MigrationReviewPage selector={REVIEW_SELECTOR} />
    </MemoryRouter>
  );
  const loaded = async () => {
    await screen.findByText(/Analyzed revision:/);
  };
  return {
    api,
    loaded,
    setView: (next: MigrationReviewSessionView) => {
      view = next;
    }
  };
};
const selectAuthority = () => {
  fireEvent.click(screen.getByRole("button", { name: "Course authority" }));
  fireEvent.change(screen.getByLabelText("Fallback administrator"), { target: { value: "prof" } });
  fireEvent.change(screen.getByLabelText("Add term to creation order"), {
    target: { value: "27s1" }
  });
  fireEvent.click(screen.getByLabelText("I reviewed the complete term creation order"));
};
const selectTerm = () => {
  fireEvent.click(screen.getByRole("button", { name: "Terms" }));
  fireEvent.click(screen.getByLabelText("27s1 coordinator prof"));
  fireEvent.change(screen.getByLabelText("27s1 lifecycle status"), { target: { value: "draft" } });
  fireEvent.change(screen.getByLabelText("27s1 has ever been active"), {
    target: { value: "false" }
  });
};

describe("Migration Review page", () => {
  it("offers six accessible steps, exact revision and review-only messaging, with no migration action", async () => {
    const f = setup();
    await f.loaded();
    const nav = screen.getByRole("navigation", { name: "Migration review steps" });
    expect(within(nav).getAllByRole("button")).toHaveLength(6);
    expect(screen.getByText(/This page makes no course/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByRole("button", { name: "Complete migration review" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /Migrate now|Publish migration|Write Schema v2/ })
    ).not.toBeInTheDocument();
  });
  it("does not preselect fallback, coordinators, lifecycle or unproven history", async () => {
    const f = setup();
    await f.loaded();
    fireEvent.click(screen.getByRole("button", { name: "Course authority" }));
    expect(screen.getByLabelText("Fallback administrator")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Terms" }));
    expect(screen.getByLabelText("27s1 coordinator prof")).not.toBeChecked();
    expect(screen.getByLabelText("27s1 lifecycle status")).toHaveValue("");
    expect(screen.getByLabelText("27s1 has ever been active")).toHaveValue("");
    expect(screen.getByText(/prof → faculty-now/)).toBeInTheDocument();
  });
  it("completes typed authority and lifecycle decisions with publication blockers retained", async () => {
    const f = setup();
    await f.loaded();
    selectAuthority();
    selectTerm();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByRole("button", { name: "Complete migration review" })).toBeEnabled();
    expect(screen.getByText(/Legacy grader debt remains/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete migration review" }));
    await screen.findByRole("heading", { name: "Review result: complete" });
    expect(f.api.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: expect.objectContaining({
          fallbackAdministratorUsername: "prof",
          creationOrder: { termCodes: ["27s1"], confirmed: true },
          terms: [
            {
              termCode: "27s1",
              currentCoordinatorUsernames: ["prof"],
              status: "draft",
              hasEverBeenActive: false
            }
          ]
        })
      })
    );
  });
  it("shows unresolved references and suggestions, and requires a separate remote verification action", async () => {
    const input = migrationSnapshotFixture(false);
    input.suggestions = [
      {
        institutionalUsername: "prof",
        githubLogin: "suggested-faculty",
        reason: "legacy suggestion"
      }
    ];
    const f = setup(migrationViewFixture(input));
    await f.loaded();
    fireEvent.click(screen.getByRole("button", { name: "Faculty" }));
    expect(screen.getByText(/assignment ownership lab04/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use suggestion suggested-faculty" }));
    expect(f.api.verify).not.toHaveBeenCalled();
    expect(screen.getByLabelText("GitHub login for prof")).toHaveValue("suggested-faculty");
    const resolved = migrationViewFixture({
      ...input,
      trustedIdentities: [
        {
          institutionalUsername: "prof",
          githubUserId: REVIEW_USER,
          githubLogin: "suggested-faculty",
          provenance: "trusted-identity-evidence",
          reference: "explicit-review"
        }
      ]
    });
    f.setView({ ...resolved, sessionId: "new-session" });
    fireEvent.click(screen.getByRole("button", { name: "Verify prof" }));
    await waitFor(() =>
      expect(f.api.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionalUsername: "prof",
          githubLogin: "suggested-faculty",
          addFaculty: false
        })
      )
    );
    await screen.findByText(/Resolution: suggested-faculty/);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
  it("supports explicitly added faculty with institutional username and login only", async () => {
    const f = setup();
    await f.loaded();
    fireEvent.click(screen.getByRole("button", { name: "Faculty" }));
    fireEvent.change(screen.getByLabelText("New institutional username"), {
      target: { value: "recovery" }
    });
    fireEvent.change(screen.getByLabelText("New faculty GitHub login"), {
      target: { value: "recovery-login" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and add faculty" }));
    await waitFor(() =>
      expect(f.api.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionalUsername: "recovery",
          githubLogin: "recovery-login",
          addFaculty: true
        })
      )
    );
  });
  it("provides accessible ordering controls, preserves explicit order and resets confirmation after moving", async () => {
    const input = extraTermFixture(migrationSnapshotFixture());
    input.history = {
      complete: true,
      sourceCommitSha: input.binding.sourceCommitSha,
      commits: [
        { sha: "b".repeat(40), parents: [], termCodes: [] },
        { sha: "c".repeat(40), parents: ["b".repeat(40)], termCodes: ["27s1"] },
        {
          sha: input.binding.sourceCommitSha,
          parents: ["c".repeat(40)],
          termCodes: ["27s1", "26s3"]
        }
      ]
    };
    const f = setup(migrationViewFixture(input));
    await f.loaded();
    fireEvent.click(screen.getByRole("button", { name: "Course authority" }));
    expect(screen.getByText(/Git history supports this candidate/)).toBeInTheDocument();
    const order = screen.getByRole("list", { name: "Reviewed term creation order" });
    expect(within(order).getAllByRole("listitem")[0]).toHaveTextContent("27s1");
    fireEvent.click(screen.getByLabelText("I reviewed the complete term creation order"));
    fireEvent.click(screen.getByRole("button", { name: "Move 27s1 down" }));
    expect(within(order).getAllByRole("listitem")[0]).toHaveTextContent("26s3");
    expect(screen.getByLabelText("I reviewed the complete term creation order")).not.toBeChecked();
  });
  it("surfaces multiple Active terms immediately", async () => {
    const f = setup(migrationViewFixture(extraTermFixture(migrationSnapshotFixture())));
    await f.loaded();
    fireEvent.click(screen.getByRole("button", { name: "Terms" }));
    fireEvent.change(screen.getByLabelText("27s1 lifecycle status"), {
      target: { value: "active" }
    });
    fireEvent.change(screen.getByLabelText("26s3 lifecycle status"), {
      target: { value: "active" }
    });
    expect(screen.getByRole("alert")).toHaveTextContent("At most one term may be Active");
  });
  it("shows deferred acknowledgements, machine-local evidence, grader debt and unknown organization blocker", async () => {
    const input = migrationSnapshotFixture();
    delete input.binding.historicalOrganizationId;
    input.sourceFiles = {
      ...input.sourceFiles,
      "terms/27s1/assignments/lab04/assignment.yml": stringify({
        schema_version: 1,
        assignment: { slug: "lab04", title: "Lab 04", type: "individual", status: "closed" },
        sections: ["001"],
        repository_mode: "group"
      })
    };
    input.runtime.files = { "terms/27s1/manifests/lab04/manifest.yml": "[" };
    const f = setup(migrationViewFixture(input));
    await f.loaded();
    fireEvent.click(screen.getByRole("button", { name: "Assignments & Apply evidence" }));
    expect(screen.getByText(/Schema publication remains blocked/)).toBeInTheDocument();
    expect(screen.getByText(/Grader is not a Schema v2 role/)).toBeInTheDocument();
    expect(screen.getByText(/Machine-local runtime: Invalid manifest/)).toBeInTheDocument();
    const ownerless = screen.getByLabelText(/I understand this ownerless/);
    expect(ownerless).not.toBeChecked();
    fireEvent.click(ownerless);
    expect(screen.getByLabelText(/I understand legacy closed/)).toBeInTheDocument();
    expect(screen.getByLabelText(/I understand group target/)).toBeInTheDocument();
  });
  it("shows stale completion and refreshes without retaining security decisions", async () => {
    const f = setup();
    await f.loaded();
    selectAuthority();
    selectTerm();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const view = migrationViewFixture();
    const result = loadMigrationReviewBackend().validateMigrationReview(
      view,
      loadMigrationReviewBackend().emptyMigrationReviewSubmission(view)
    );
    f.api.complete.mockResolvedValueOnce({ ...result, status: "stale" });
    fireEvent.click(screen.getByRole("button", { name: "Complete migration review" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("review is stale");
    const input = migrationSnapshotFixture();
    input.binding.sourceCommitSha = REVIEW_NEW_SHA;
    f.setView({ ...migrationViewFixture(input), sessionId: "refreshed-session" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh analysis" }));
    await screen.findByText(/Analysis refreshed/);
    fireEvent.click(screen.getByRole("button", { name: "Course authority" }));
    expect(screen.getByLabelText("Fallback administrator")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Terms" }));
    expect(screen.getByLabelText("27s1 coordinator prof")).not.toBeChecked();
  });
});
