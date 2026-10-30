import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CourseMutationStatus } from "./CourseMutationStatus";
import type { CourseMutationNotice } from "../../electron/managedCourseMutationTypes";

vi.mock("./ManagedCacheReview", () => ({
  ManagedCacheReview: () => <button>Review cache</button>
}));
afterEach(() => {
  vi.restoreAllMocks();
});
it("shows checking, routes cache review, and never resumes the blocked mutation", async () => {
  let notify!: (notice: CourseMutationNotice) => void;
  const mutation = vi.fn();
  Object.assign(window.graiderUI, {
    onCourseMutationNotice: (listener: (notice: CourseMutationNotice) => void) => {
      notify = listener;
      return () => {};
    },
    githubOAuth: {
      get: vi.fn().mockResolvedValue({ courseDiscovery: { courses: [{ repositoryId: 20 }] } })
    },
    saveRoster: mutation
  });
  render(<CourseMutationStatus />);
  act(() => notify({ status: "checking" }));
  expect(screen.getByRole("status")).toHaveTextContent("Checking latest course state");
  act(() => {
    notify({
      status: "blocked",
      reason: "managed_cache_review_required",
      repositoryId: 20,
      message: "Review cache then retry",
      action: "review_cache",
      retryable: false
    });
    notify({ status: "finished" });
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Review cache" })).toBeInTheDocument()
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review cache" }));
  expect(mutation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("updates only the registered ID, requires a full view reload, and never replays a save", async () => {
  let notify!: (notice: CourseMutationNotice) => void;
  const save = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn(async () => {
    notify({ status: "view_invalidated" });
    notify({ status: "source_updated" });
  });
  Object.assign(window.graiderUI, {
    onCourseMutationNotice: (listener: (notice: CourseMutationNotice) => void) => {
      notify = listener;
      return () => {};
    },
    updateCourseSource: update,
    reloadCourseView: reload,
    saveAssignmentEdit: save,
    saveRoster: save
  });
  render(<CourseMutationStatus />);
  act(() =>
    notify({
      status: "blocked",
      reason: "operational_source_updateable",
      message: "Course source is out of date.",
      repositoryId: 20,
      courseFolderId: "legacy",
      action: "update_source",
      retryable: false
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "Update course source" }));
  await waitFor(() =>
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Course source updated. Refresh/reopen this view before retrying the change."
    )
  );
  expect(update).toHaveBeenCalledExactlyOnceWith("legacy");
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Refresh view" }));
  expect(reload).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});

it("does not offer an update for a generic stale or unsafe source", () => {
  let notify!: (notice: CourseMutationNotice) => void;
  Object.assign(window.graiderUI, {
    onCourseMutationNotice: (listener: typeof notify) => {
      notify = listener;
      return () => {};
    }
  });
  render(<CourseMutationStatus />);
  act(() =>
    notify({
      status: "blocked",
      reason: "operational_source_stale",
      message: "Resolve unpublished work",
      action: "attention",
      retryable: false
    })
  );
  expect(screen.queryByRole("button", { name: "Update course source" })).not.toBeInTheDocument();
});
