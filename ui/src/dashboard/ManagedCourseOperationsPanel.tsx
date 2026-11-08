import { useState, type ReactElement } from "react";
import type { ManagedCourseInspection } from "../../electron/remoteCourseTypes";
import type { AssignmentSetupTermsResult, RosterLoadResult } from "../../electron/ipc";

const lifecycleExplanation = (reason: string): string => {
  const explanations: Readonly<Record<string, string>> = {
    "draft-term-exists": "Archive is unavailable while a Draft term exists.",
    "active-term-exists": "Archive is unavailable while a term is Active.",
    "no-course-lifecycle-authority":
      "Course archive actions require fallback administration or current coordination of the most recently created term.",
    "reconciliation-required":
      "Course migration or GitHub reconciliation needs attention before changing archive state."
  };
  return (
    explanations[reason] ??
    "Course lifecycle evidence needs attention. Refresh Course details before changing archive state."
  );
};

/** Read-only evidence UI. Backend independently evaluates every requested scope. */
export const ManagedCourseOperationsPanel = ({
  inspection,
  userId,
  onChanged
}: {
  readonly inspection: ManagedCourseInspection;
  readonly userId: number;
  readonly onChanged: () => void;
}): ReactElement => {
  const [scope, setScope] = useState<"default" | "coordinator-term">("default");
  const [terms, setTerms] = useState<AssignmentSetupTermsResult | null>(null);
  const [roster, setRoster] = useState<RosterLoadResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const folderId = `managed-course:${userId}:${inspection.repositoryId}`;
  const request = { courseFolderId: folderId, courseFolderPath: folderId, scope };
  return (
    <section aria-label="Managed course operations">
      <p>
        Roster and reusable-comment evidence is read only. Assignment editing, Apply, student
        repositories, grading and publication require later phase services.
      </p>
      <label>
        <input
          type="checkbox"
          checked={scope === "coordinator-term"}
          onChange={(event) => {
            setScope(event.target.checked ? "coordinator-term" : "default");
            setTerms(null);
            setRoster(null);
          }}
        />
        Expand to all sections as coordinator
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage(null);
          void window.graiderUI
            .loadRosterTerms?.(request)
            .then(setTerms)
            .catch(() =>
              setMessage("Section access could not be verified. Refresh Course details.")
            )
            .finally(() => setBusy(false));
        }}
      >
        Inspect authorized rosters
      </button>
      {terms?.terms.map((term) => (
        <div key={term.code}>
          <h4>{term.code}</h4>
          {term.sections.length ? (
            term.sections.map((sectionId) => (
              <button
                type="button"
                key={sectionId}
                onClick={() => {
                  setRoster(null);
                  setMessage(null);
                  void window.graiderUI
                    .getRosterForSection?.({ ...request, termCode: term.code, sectionId })
                    .then(setRoster)
                    .catch(() => setMessage("This section is unavailable to the current account."));
                }}
              >
                Read section {sectionId}
              </button>
            ))
          ) : (
            <p>No section data in this scope.</p>
          )}
          <button
            type="button"
            onClick={() => {
              void window.graiderUI
                .loadGradingCommentLibrary?.({ courseFolderId: folderId, termCode: term.code })
                .then((library) => {
                  setMessage(
                    library.status === "success"
                      ? library.comments
                          .map((comment) => `${comment.title}: ${comment.text}`)
                          .join("\n") || "No preserved reusable comments."
                      : "Reusable-comment evidence needs attention."
                  );
                })
                .catch(() => setMessage("This role does not authorize shared-comment inspection."));
            }}
          >
            Read shared comments
          </button>
        </div>
      ))}
      {roster ? (
        <div>
          <p>Read-only roster evidence</p>
          <ul>
            {roster.rows.map((student) => (
              <li key={student.studentId}>
                {student.studentId} — {student.githubUsername} — {student.status}
              </li>
            ))}
          </ul>
          {roster.diagnostics.map((item) => (
            <p key={item.message}>{item.message}</p>
          ))}
        </div>
      ) : null}
      {inspection.operations && inspection.revision ? (
        <>
          {inspection.operations.archiveAllowed || inspection.operations.unarchiveAllowed ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setMessage(null);
                void window.graiderUI
                  .changeManagedCourseLifecycle?.({
                    courseFolderId: folderId,
                    expectedCourseRevision: inspection.revision!,
                    targetStatus: inspection.operations!.unarchiveAllowed
                      ? "unarchived"
                      : "archived"
                  })
                  .then((result) => {
                    setMessage(
                      result.status === "needs_attention"
                        ? lifecycleExplanation(result.reason)
                        : "Course lifecycle saved remotely."
                    );
                    onChanged();
                  })
                  .catch(() =>
                    setMessage(
                      "Course lifecycle could not be changed. Refresh Course details and inspect authorization/readiness."
                    )
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {inspection.operations.unarchiveAllowed ? "Unarchive course" : "Archive course"}
            </button>
          ) : (
            <p>{lifecycleExplanation(inspection.operations.lifecycleReason)}</p>
          )}
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
};
