import { useEffect, useState } from "react";
import type { CourseMutationBlock } from "../../electron/managedCourseMutationTypes";
import type { RemoteCourse } from "../../electron/remoteCourseTypes";
import { ManagedCacheReview } from "./ManagedCacheReview";

/** Observational notifications cannot authorize or resume a mutation. */
export const CourseMutationStatus = () => {
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState<CourseMutationBlock | null>(null);
  const [course, setCourse] = useState<RemoteCourse | null>(null);
  const [updating, setUpdating] = useState(false);
  const [invalidated, setInvalidated] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  useEffect(
    () =>
      window.graiderUI.onCourseMutationNotice?.((notice) => {
        if (notice.status === "view_invalidated" || notice.status === "source_updated") {
          setInvalidated(true);
          if (notice.status === "source_updated") setUpdated(true);
        }
        if (notice.status === "checking") {
          setChecking(true);
          setBlocked(null);
          setCourse(null);
        }
        if (notice.status === "finished") setChecking(false);
        if (notice.status === "blocked") {
          setBlocked(notice);
          void window.graiderUI.githubOAuth?.get().then((state) => {
            setCourse(
              state.courseDiscovery.courses.find(
                (item) => item.repositoryId === notice.repositoryId
              ) ?? null
            );
          });
        }
      }),
    []
  );
  return (
    <>
      {invalidated ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Refresh course view"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            background: "#ffffffee",
            display: "grid",
            placeItems: "center"
          }}
        >
          <div className="detail-panel" style={{ padding: 24 }}>
            <p>
              {updating
                ? "Updating course source…"
                : updated
                  ? "Course source updated. Refresh/reopen this view before retrying the change."
                  : "Course source may have changed. Refresh/reopen this view before retrying the change."}
            </p>
            <p>Refreshing discards unsaved form values and loads the current course data.</p>
            <button
              type="button"
              disabled={updating}
              onClick={() => {
                void window.graiderUI.reloadCourseView?.();
              }}
            >
              Refresh view
            </button>
          </div>
        </div>
      ) : null}
      {checking ? (
        <div
          role="status"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "transparent",
            padding: 16,
            display: "grid",
            placeItems: "start end"
          }}
        >
          <span className="detail-panel" style={{ background: "white", padding: 16 }}>
            Checking latest course state…
          </span>
        </div>
      ) : null}
      {blocked ? (
        <aside
          role="alert"
          className="detail-panel"
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            maxWidth: 560,
            maxHeight: "85vh",
            overflowY: "auto",
            zIndex: 2001,
            background: "white",
            padding: 20,
            border: "1px solid #888"
          }}
        >
          <p>{blocked.message}</p>
          {blocked.action === "update_source" && blocked.courseFolderId ? (
            <>
              <button
                type="button"
                disabled={updating}
                onClick={() => {
                  setUpdating(true);
                  setUpdateError(null);
                  void window.graiderUI
                    .updateCourseSource?.(blocked.courseFolderId!)
                    .catch(() => {
                      setUpdateError(
                        "Course source could not be updated. Local work is preserved. Refresh courses and review its status."
                      );
                    })
                    .finally(() => setUpdating(false));
                }}
              >
                {updating ? "Updating course source…" : "Update course source"}
              </button>
              {updateError ? <p>{updateError}</p> : null}
            </>
          ) : null}
          {blocked.action === "refresh_view" ? (
            <button
              type="button"
              onClick={() => {
                void window.graiderUI.reloadCourseView?.();
              }}
            >
              Refresh view
            </button>
          ) : null}
          {blocked.action === "review_cache" && course ? (
            <ManagedCacheReview course={course} />
          ) : null}
          {blocked.action === "faculty_settings" || blocked.action === "authorization" ? (
            <a href="#/?facultySettings=1">Open Faculty settings</a>
          ) : null}
          {blocked.action === "retry" ? <p>Retry the original action when ready.</p> : null}
          <button type="button" onClick={() => setBlocked(null)}>
            Dismiss
          </button>
        </aside>
      ) : null}
    </>
  );
};
