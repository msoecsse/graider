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
