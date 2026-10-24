import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagedCacheReview } from "./ManagedCacheReview";
import type { ManagedReconciliationState, RemoteCourse } from "../../electron/remoteCourseTypes";
const course = {
  repositoryId: 20,
  code: "CSC1120",
  authorization: "authorized",
  synchronization: { status: "needs_attention", reason: "local_changes" }
} as RemoteCourse;
const plan: ManagedReconciliationState = {
  status: "review_required",
  repositoryId: 20,
  planId: "opaque-review",
  eligible: true,
  diagnostic: "Local changes require attention.",
  retryable: false,
  evidence: {
    head: { kind: "attached", branch: "main", commit: "abcdef" },
    upstream: { kind: "missing" },
    defaultBranch: "main",
    operations: ["MERGE_HEAD"],
    files: [
      { category: "Modified", path: "course.yml" },
      { category: "Untracked", path: "notes.txt" }
    ],
    localCommits: {
      count: 1,
      commits: [{ id: "abcd", subject: "Local work", committedAt: "2026-10-24" }]
    }
  }
};
const setup = () => {
  const api = {
    planManagedReconciliation: vi.fn().mockResolvedValue(plan),
    applyManagedReconciliation: vi.fn().mockResolvedValue({
      ...plan,
      eligible: false,
      status: "completed",
      recoveryId: "opaque-recovery"
    }),
    cancelManagedReconciliation: vi.fn().mockResolvedValue(undefined),
    revealManagedRecovery: vi.fn().mockResolvedValue(undefined)
  };
  Object.assign(window.graiderUI, { githubOAuth: api });
  return api;
};
describe("managed cache faculty review", () => {
  it("requires review and explicit confirmation; reveals by IDs only", async () => {
    const api = setup();
    render(<ManagedCacheReview course={course} />);
    expect(api.applyManagedReconciliation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review cache" }));
    expect(await screen.findByText("course.yml")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(screen.getByText(/Local work/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing in the preserved copy will be uploaded/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Preserve local cache and restore from GitHub" })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Reveal preserved copy" }));
    expect(api.applyManagedReconciliation).toHaveBeenCalledWith(20, "opaque-review", true);
    expect(api.revealManagedRecovery).toHaveBeenCalledWith(20, "opaque-recovery");
  });
  it("cancels review without applying", async () => {
    const api = setup();
    render(<ManagedCacheReview course={course} />);
    fireEvent.click(screen.getByRole("button", { name: "Review cache" }));
    await screen.findByText("course.yml");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.cancelManagedReconciliation).toHaveBeenCalledWith(20, "opaque-review");
    expect(api.applyManagedReconciliation).not.toHaveBeenCalled();
  });
  it.each([
    "unsafe_repository",
    "network_failure",
    "organization_transfer",
    "invalid_remote_metadata",
    "authorization_lost"
  ] as const)("offers no replacement for %s", (reason) => {
    setup();
    render(
      <ManagedCacheReview
        course={{
          ...course,
          synchronization: { status: "needs_attention", reason, diagnostic: null, retryable: false }
        }}
      />
    );
    expect(screen.queryByRole("button", { name: "Review cache" })).not.toBeInTheDocument();
    if (reason === "unsafe_repository")
      expect(screen.getByText(/manual review required/)).toBeInTheDocument();
  });
  it("requires a fresh review after a stale plan", async () => {
    const api = setup();
    api.applyManagedReconciliation.mockResolvedValueOnce({
      status: "stale_plan",
      eligible: false,
      diagnostic: "Managed cache changed since review. Review it again before restoring."
    });
    render(<ManagedCacheReview course={course} />);
    fireEvent.click(screen.getByRole("button", { name: "Review cache" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Preserve local cache and restore from GitHub" })
    );
    expect(await screen.findByRole("button", { name: "Review cache again" })).toBeInTheDocument();
  });
});
