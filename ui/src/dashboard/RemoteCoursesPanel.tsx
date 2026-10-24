import { ManagedCacheReview } from "./ManagedCacheReview";
import { synchronizationLabel } from "../../electron/remoteCourseTypes";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { GithubOAuthState } from "../../electron/githubOAuthTypes";

const STATE_POLL_MS = 500;
/** One dashboard snapshot; operations invalidate outstanding polling responses. */
export const useRemoteCourses = () => {
  const [state, setState] = useState<GithubOAuthState | null>(null);
  const generation = useRef(0);
  const accept = useCallback((next: GithubOAuthState) => {
    generation.current += 1;
    setState(next);
  }, []);
  useEffect(() => {
    let mounted = true;
    let pending = false;
    const read = async () => {
      if (!pending && window.graiderUI.githubOAuth) {
        pending = true;
        const current = generation.current;
        try {
          const next = await window.graiderUI.githubOAuth.get();
          if (mounted && current === generation.current) setState(next);
        } catch {
          /* Account panel reports transport errors; never project provider errors. */
        } finally {
          pending = false;
        }
      }
    };
    void read();
    const timer = setInterval(() => {
      void read();
    }, STATE_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);
  const refresh = async () => {
    if (window.graiderUI.githubOAuth) {
      generation.current += 1;
      setState((current) =>
        current
          ? {
              ...current,
              courseDiscovery: { ...current.courseDiscovery, courses: [], status: "loading" }
            }
          : current
      );
      try {
        accept(await window.graiderUI.githubOAuth.refreshOrganizations());
      } catch {
        setState((current) =>
          current
            ? { ...current, courseDiscovery: { ...current.courseDiscovery, status: "error" } }
            : current
        );
      }
    }
  };
  return { state, accept, refresh };
};
export const RemoteCoursesPanel = ({
  state,
  onRefresh,
  onSettings
}: {
  readonly state: GithubOAuthState | null;
  readonly onRefresh: () => void;
  readonly onSettings: () => void;
}): ReactElement => {
  const [inspection, setInspection] = useState<
    import("../../electron/remoteCourseTypes").ManagedCourseInspection | null
  >(null);
  const [inspectionUserId, setInspectionUserId] = useState<number | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  useEffect(() => {
    setInspection(null);
    setInspectionError(null);
  }, [state?.identity?.id]);
  const discovery = state?.courseDiscovery;
  const current = state?.identity && discovery?.userId === state.identity.id ? discovery : null;
  const visible =
    current?.courses.filter(
      (course) =>
        course.localStatus !== "registered_local" &&
        (course.authorization === "authorized" ||
          course.authorization === "faculty_identity_required")
    ) ?? [];
  const synchronizing =
    current?.courses.filter(
      (course) =>
        course.authorization === "authorized" &&
        ["queued", "checking", "fetching", "updating"].includes(
          course.synchronization?.status ?? ""
        )
    ) ?? [];
  const eligible = current?.courses.filter((course) => course.authorization === "authorized") ?? [];
  const completed = eligible.length - synchronizing.length;
  const inspectionVersion = current?.courses.find(
    (course) => course.repositoryId === inspection?.repositoryId
  )?.synchronization?.lastSuccessfulAt;
  useEffect(() => {
    let active = true;
    if (inspectionVersion && inspection && inspectionUserId === current?.userId) {
      void window.graiderUI.githubOAuth
        ?.inspectManagedCourse?.(inspection.repositoryId)
        .then((value) => {
          if (active) setInspection(value);
        })
        .catch(() => {
          if (active) setInspection(null);
        });
    }
    return () => {
      active = false;
    };
  }, [inspectionVersion, inspection?.repositoryId, inspectionUserId, current?.userId]);
  return (
    <section aria-label="Remote courses" className="detail-panel">
      <h2>Remote courses</h2>
      {!state?.identity ? (
        <button type="button" onClick={onSettings}>
          Sign in to discover courses
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onRefresh}
            disabled={state.busy || discovery?.status === "loading"}
          >
            Refresh courses
          </button>
          {state.repositoryPermission === "required" ? (
            <>
              <p>GitHub authorization needs updating for private course discovery.</p>
              <button type="button" onClick={onSettings}>
                Authorize course access
              </button>
            </>
          ) : null}
          {discovery?.status === "loading" ? (
            <p role="status">Discovering remote courses…</p>
          ) : null}
          {discovery?.status === "error" ? (
            <p role="status">
              Course discovery temporarily unavailable. Your sign-in is preserved.
            </p>
          ) : null}
          {synchronizing.length > 0 ? (
            <div role="status">
              <p>
                Updating courses — {completed} of {eligible.length} complete
              </p>
              <progress
                aria-label="Course synchronization"
                value={completed}
                max={eligible.length}
              />
            </div>
          ) : null}
          {current?.courses
            .filter(
              (course) =>
                course.localStatus === "registered_local" && course.synchronization?.retryable
            )
            .map((course) => (
              <button type="button" key={course.repositoryId} onClick={onRefresh}>
                Retry synchronization — {course.code}
              </button>
            ))}
          {current?.courses
            .filter((course) => course.localStatus === "registered_local")
            .map((course) => (
              <div
                key={`${current.userId}:${course.repositoryId}`}
                aria-label={`Managed cache — ${course.code}`}
              >
                <ManagedCacheReview course={course} />
              </div>
            ))}
          {visible.map((course) => (
            <article key={course.repositoryId}>
              <h3>
                {course.code} — {course.title}
              </h3>
              <p>{course.fullName}</p>
              {course.authorization === "faculty_identity_required" ? (
                <>
                  <p>Set your MSOE username to verify course access.</p>
                  <button type="button" onClick={onSettings}>
                    Set faculty MSOE username
                  </button>
                </>
              ) : (
                <>
                  <p>
                    {course.bootstrap?.status === "ready"
                      ? course.synchronization
                        ? synchronizationLabel(course.synchronization)
                        : "Cached locally"
                      : course.bootstrap?.status === "bootstrapping"
                        ? "Setting up course…"
                        : course.bootstrap?.status === "queued"
                          ? "Course setup queued"
                          : course.bootstrap?.status === "failed"
                            ? "Course setup failed"
                            : course.bootstrap?.status === "needs_attention"
                              ? "Needs attention"
                              : "Available remotely"}
                  </p>
                  <ManagedCacheReview
                    key={`${current?.userId}:${course.repositoryId}`}
                    course={course}
                  />
                  {course.synchronization?.diagnostic ? (
                    <p>{course.synchronization.diagnostic}</p>
                  ) : null}
                  {course.synchronization?.retryable ? (
                    <button type="button" onClick={onRefresh}>
                      Retry synchronization
                    </button>
                  ) : null}
                  {course.bootstrap?.diagnostic ? <p>{course.bootstrap.diagnostic}</p> : null}
                  {course.bootstrap?.retryable ? (
                    <button type="button" onClick={onRefresh}>
                      Retry course setup
                    </button>
                  ) : null}
                  {course.bootstrap?.status === "ready" &&
                  course.synchronization?.status !== "needs_attention" ? (
                    <button
                      type="button"
                      onClick={() => {
                        const requestedUserId = state?.identity?.id ?? null;
                        void window.graiderUI.githubOAuth
                          ?.inspectManagedCourse?.(course.repositoryId)
                          .then((value) => {
                            setInspectionUserId(requestedUserId);
                            setInspection(value);
                            setSelectedTerm(value.terms[0] ?? null);
                          })
                          .catch(() =>
                            setInspectionError(
                              "Course cache could not be inspected. Refresh courses."
                            )
                          );
                      }}
                    >
                      Inspect course
                    </button>
                  ) : null}
                </>
              )}
              {course.diagnostics.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </article>
          ))}
          {inspection &&
          inspectionUserId === current?.userId &&
          visible.some(
            (course) =>
              course.repositoryId === inspection.repositoryId &&
              course.bootstrap?.status === "ready" &&
              course.synchronization?.status !== "needs_attention"
          ) ? (
            <section aria-label="Cached course details">
              <h3>
                {inspection.code} — {inspection.title}
              </h3>
              <p>Managed course metadata. Updated at startup and when you refresh courses.</p>
              <ul>
                {inspection.terms.map((term) => (
                  <li key={term}>
                    <button
                      type="button"
                      onClick={() => setSelectedTerm(term)}
                      aria-pressed={term === selectedTerm}
                    >
                      {term}
                    </button>
                  </li>
                ))}
              </ul>
              {selectedTerm ? (
                <section aria-label="Cached assignments">
                  <h4>{selectedTerm} assignments</h4>
                  {inspection.assignments
                    .filter((assignment) => assignment.term === selectedTerm)
                    .map((assignment) => (
                      <details key={assignment.slug}>
                        <summary>{assignment.title}</summary>
                        <p>
                          {assignment.slug} · {assignment.status}
                        </p>
                      </details>
                    ))}
                </section>
              ) : null}
              <button type="button" onClick={() => setInspection(null)}>
                Close course details
              </button>
            </section>
          ) : null}
          {inspectionError ? <p role="status">{inspectionError}</p> : null}
          {current &&
          (current.diagnostics.length > 0 ||
            current.courses.some(
              (course) =>
                course.authorization === "not_authorized" || course.authorization === "unavailable"
            )) ? (
            <details>
              <summary>Course discovery needs attention</summary>
              {current.diagnostics.map((item, index) => (
                <p key={`${item.organizationId}:${item.repositoryId}:${index}`}>{item.message}</p>
              ))}
              {current.courses
                .filter(
                  (course) =>
                    course.authorization === "not_authorized" ||
                    course.authorization === "unavailable"
                )
                .map((course) => (
                  <p key={course.repositoryId}>
                    {course.code}:{" "}
                    {course.authorization === "not_authorized"
                      ? "Current MSOE faculty identity has no assigned sections."
                      : "Faculty authorization could not be verified."}
                  </p>
                ))}
            </details>
          ) : null}
        </>
      )}
    </section>
  );
};
