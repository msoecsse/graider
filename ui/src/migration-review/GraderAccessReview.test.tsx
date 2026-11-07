import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GraderAccessReviewStep } from "./GraderAccessReview";
import { graderContextFixture, migrationViewFixture } from "../../electron/migrationReviewFixtures";
import { loadMigrationReviewBackend } from "../../electron/migrationReviewService";

const setup = (enabled = true, context = graderContextFixture()) => {
  const api = {
    loadGrader: vi.fn(async () => context),
    completeGrader: vi.fn(async (request) =>
      loadMigrationReviewBackend().reviewGraderAccess(context, request.submission)
    )
  };
  Object.assign(window.graiderUI, { migrationReview: api });
  render(<GraderAccessReviewStep view={migrationViewFixture()} enabled={enabled} />);
  return { api, context };
};
describe("faculty legacy access review", () => {
  it("requires completed migration review before inventory", () => {
    setup(false);
    expect(screen.getByRole("button", { name: "Load grader inventory" })).toBeDisabled();
  });
  it("shows immutable members, preserves explicit empty choices and submits dispositions", async () => {
    const f = setup();
    fireEvent.click(screen.getByRole("button", { name: "Load grader inventory" }));
    await screen.findByText(/new-faculty · GitHub ID/);
    expect(screen.getByLabelText("Disposition for faculty-now")).toHaveValue("");
    expect(screen.getByLabelText("Disposition for new-faculty")).toHaveValue("");
    expect(screen.getByText(/27s1 \/ 001/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Disposition for faculty-now"), {
      target: { value: "existing_sufficient" }
    });
    fireEvent.change(screen.getByLabelText("Disposition for new-faculty"), {
      target: { value: "no_access" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete grader access review" }));
    await screen.findByText(/Grader access review: complete/);
    expect(f.api.completeGrader).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: {
          inventoryId: f.context.inventoryId,
          decisions: [
            { githubUserId: 101, disposition: "existing_sufficient", sections: [] },
            { githubUserId: 102, disposition: "no_access", sections: [] }
          ]
        }
      })
    );
  });
  it("clears decisions when inventory is replaced", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Load grader inventory" }));
    await screen.findByLabelText("Disposition for faculty-now");
    fireEvent.change(screen.getByLabelText("Disposition for faculty-now"), {
      target: { value: "existing_sufficient" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Load grader inventory" }));
    expect(await screen.findByLabelText("Disposition for faculty-now")).toHaveValue("");
  });
  it("requires explicit exact archived selection for verified additions", async () => {
    const base = graderContextFixture();
    const context = {
      ...base,
      review: {
        ...base.review,
        facultyDirectory: [
          ...base.review.facultyDirectory,
          {
            institutional_username: "newprof",
            github_user_id: 102,
            github_login: "new-faculty",
            github_login_history: []
          }
        ],
        terms: base.review.terms.map((term) => ({
          ...term,
          status: "archived" as const,
          hasEverBeenActive: true
        }))
      }
    };
    setup(true, context);
    fireEvent.click(screen.getByRole("button", { name: "Load grader inventory" }));
    await screen.findByLabelText("Disposition for new-faculty");
    fireEvent.change(screen.getByLabelText("Disposition for faculty-now"), {
      target: { value: "existing_sufficient" }
    });
    fireEvent.change(screen.getByLabelText("Disposition for new-faculty"), {
      target: { value: "assign" }
    });
    expect(screen.getByLabelText("new-faculty 27s1 section 001")).not.toBeChecked();
    expect(screen.getByText(/Selection confirms normal completion/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("new-faculty 27s1 section 001"));
    fireEvent.click(screen.getByRole("button", { name: "Complete grader access review" }));
    await screen.findByText(/Grader access review: complete/);
  });
});
