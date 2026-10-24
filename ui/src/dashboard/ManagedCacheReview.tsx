import { useEffect, useRef, useState } from "react";
import { canReviewManagedCache } from "../../electron/remoteCourseTypes";
import type { ManagedReconciliationState, RemoteCourse } from "../../electron/remoteCourseTypes";

const STAGE_LABELS: Partial<Record<ManagedReconciliationState["status"], string>> = {
  planning: "Reviewing cache",
  preparing: "Preparing restoration",
  cloning_replacement: "Preparing fresh GitHub copy",
  validating: "Validating replacement",
  preserving_existing: "Preserving local cache",
  activating_replacement: "Activating replacement"
};
export const ManagedCacheReview = ({ course }: { readonly course: RemoteCourse }) => {
  const [review, setReview] = useState<ManagedReconciliationState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const active = busy ? (course.reconciliation ?? review) : review;
  const progress = active ? STAGE_LABELS[active.status] : undefined;
  const recoverable = canReviewManagedCache(course);
  const evidence = review?.evidence;
  const recoveryId = course.reconciliation?.recoveryId ?? review?.recoveryId;
  const plan = async () => {
    setOpen(true);
    setBusy(true);
    setError(null);
    setReview({
      status: "planning",
      repositoryId: course.repositoryId,
      eligible: false,
      diagnostic: null,
      retryable: false
    });
    try {
      const next = await window.graiderUI.githubOAuth?.planManagedReconciliation?.(
        course.repositoryId
      );
      if (mounted.current && next) setReview(next);
    } catch {
      if (mounted.current)
        setError("Cache review could not finish. Refresh courses and review again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const apply = async () => {
    if (review?.planId && review.eligible) {
      setBusy(true);
      setError(null);
      try {
        const next = await window.graiderUI.githubOAuth?.applyManagedReconciliation?.(
          course.repositoryId,
          review.planId,
          true
        );
        if (mounted.current && next) {
          setReview(next);
          if (next.status === "completed") setOpen(false);
        }
      } catch {
        if (mounted.current)
          setError("Restoration could not finish. Refresh courses to inspect the cache.");
      } finally {
        if (mounted.current) setBusy(false);
      }
    }
  };
  const cancel = async () => {
    try {
      await window.graiderUI.githubOAuth?.cancelManagedReconciliation?.(
        course.repositoryId,
        review?.planId
      );
    } catch {
      /* Account changes invalidate review independently. */
    }
    if (mounted.current && !busy) {
      setOpen(false);
      setReview(null);
    }
  };
  return (
    <>
      {recoverable ? (
        <button type="button" disabled={busy} onClick={() => void plan()}>
          Review cache
        </button>
      ) : null}
      {(course.synchronization?.reason ?? course.bootstrap?.reason) === "unsafe_repository" ? (
        <p>Needs attention — manual review required</p>
      ) : null}
      {recoveryId ? (
        <p>
          Previous local cache preserved.{" "}
          <button
            type="button"
            onClick={() => {
              void window.graiderUI.githubOAuth
                ?.revealManagedRecovery?.(course.repositoryId, recoveryId)
                .catch(() =>
                  setError("Preserved copy could not be revealed. Check local storage.")
                );
            }}
          >
            Reveal preserved copy
          </button>
        </p>
      ) : null}
      {open ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={`Review managed cache — ${course.code}`}
          className="detail-panel"
        >
          <h3>Review managed cache — {course.code}</h3>
          {busy ? <p role="status">{progress ?? "Preparing restoration"}</p> : null}
          <h4>Why attention is required</h4>
          <p>
            {review?.diagnostic ??
              "Graider’s managed cache contains local state that requires review."}
          </p>
          {evidence ? (
            <>
              <h4>Local cache evidence</h4>
              <dl>
                <dt>HEAD</dt>
                <dd>
                  {evidence.head.kind === "detached"
                    ? "Detached HEAD"
                    : (evidence.head.branch ?? "Unborn HEAD")}
                </dd>
                <dt>Current commit</dt>
                <dd>{evidence.head.commit ?? "Unavailable"}</dd>
                <dt>GitHub default branch</dt>
                <dd>{evidence.defaultBranch}</dd>
                <dt>Upstream</dt>
                <dd>
                  {evidence.upstream.kind === "configured"
                    ? `${evidence.upstream.branch} — ${evidence.upstream.ahead} ahead / ${evidence.upstream.behind} behind`
                    : "Missing"}
                </dd>
              </dl>
              {evidence.operations.map((operation) => (
                <p key={operation}>Interrupted Git operation: {operation}</p>
              ))}
              {(
                [
                  "Modified",
                  "Added",
                  "Deleted",
                  "Renamed",
                  "Staged",
                  "Untracked",
                  "Conflict"
                ] as const
              ).map((category) => {
                const files = evidence.files.filter((file) => file.category === category);
                return files.length ? (
                  <details key={category} open>
                    <summary>
                      {category} ({files.length})
                    </summary>
                    <ul>
                      {files.map((file) => (
                        <li key={file.path}>
                          {file.originalPath ? `${file.originalPath} → ` : ""}
                          {file.path}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null;
              })}
              <p>
                {evidence.localCommits.count === null
                  ? "Local-only history could not be determined."
                  : `${evidence.localCommits.count} local-only commits${evidence.localCommits.count > evidence.localCommits.commits.length ? `; showing first ${evidence.localCommits.commits.length}` : ""}`}
              </p>
              {evidence.localCommits.count ? (
                <p>
                  This cache contains local Git history not present in the last observed GitHub
                  history. It will remain in the preserved copy.
                </p>
              ) : null}
              <ul>
                {evidence.localCommits.commits.map((commit) => (
                  <li key={commit.id}>
                    <code>{commit.id}</code> {commit.subject} — {commit.committedAt}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h4>What Graider will do</h4>
          <p>
            Graider will create and validate a fresh copy from GitHub, preserve this entire local
            cache as a machine-local recovery copy, and replace the active managed cache with the
            fresh copy.
          </p>
          <p>
            Nothing in the preserved copy will be uploaded. No local evidence will be deleted.
            Legacy manually registered course folders are not affected.
          </p>
          <p>
            Cancellation is available before preservation. Once preservation starts, Graider
            finishes activation or rolls back to a safe state.
          </p>
          {review?.status === "review_required" && review.eligible ? (
            <button type="button" disabled={busy} onClick={() => void apply()}>
              Preserve local cache and restore from GitHub
            </button>
          ) : null}
          {review?.status === "stale_plan" ? (
            <button type="button" onClick={() => void plan()}>
              Review cache again
            </button>
          ) : null}
          {!busy ||
          !["preserving_existing", "activating_replacement"].includes(active?.status ?? "") ? (
            <button type="button" onClick={() => void cancel()}>
              {busy || review?.status === "review_required" ? "Cancel" : "Close"}
            </button>
          ) : null}
        </section>
      ) : null}
      {error ? <p role="status">{error}</p> : null}
    </>
  );
};
