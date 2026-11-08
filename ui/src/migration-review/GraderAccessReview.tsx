import { useRef, useState } from "react";
import type {
  GraderAccessContext,
  GraderAccessSubmission,
  GraderAccessReview
} from "../../../src/migration/grader-access-review";
import type { MigrationReviewSessionView } from "../../electron/migrationReviewService";
import { migrationReviewSource } from "../../../src/migration/migration-review-validation";

export const GraderAccessReviewStep = ({
  view,
  enabled,
  onCompleted,
  onSave,
  onReview
}: {
  readonly view: MigrationReviewSessionView;
  readonly enabled: boolean;
  readonly onReview?: (review: GraderAccessReview | null) => void;
  readonly onCompleted?: (complete: boolean) => void;
  readonly onSave?: (
    request: import("../../electron/migrationReviewService").GraderAccessCompleteRequest
  ) => Promise<void>;
}) => {
  const saves = useRef<Promise<void>>(Promise.resolve());
  const [context, setContext] = useState<GraderAccessContext | null>(null);
  const [decisions, setDecisions] = useState<GraderAccessSubmission["decisions"]>([]);
  const [result, setResult] = useState<GraderAccessReview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const api = window.graiderUI.migrationReview;
  const bound = { sessionId: view.sessionId, source: migrationReviewSource(view.analysis) };
  const load = async () => {
    setBusy(true);
    setContext(null);
    setDecisions([]);
    setResult(null);
    try {
      await saves.current;
      onCompleted?.(false);
      onReview?.(null);
      const loaded = await api!.loadGrader(bound);
      setContext(loaded);
      setDecisions(loaded.savedDecisions ?? []);
      setMessage("");
    } catch {
      setMessage(
        "Grader inventory is unavailable. Check account and source, then refresh analysis and complete migration review again."
      );
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    if (!context) return;
    setBusy(true);
    try {
      await saves.current;
      const reviewed = await api!.completeGrader({
        ...bound,
        submission: { inventoryId: context.inventoryId, decisions }
      });
      setResult(reviewed);
      onCompleted?.(reviewed.status === "complete");
      onReview?.(reviewed.status === "complete" ? reviewed : null);
      setMessage("");
    } catch {
      onCompleted?.(false);
      onReview?.(null);
      setContext(null);
      setResult(null);
      setMessage("Review evidence changed. Refresh analysis and review again.");
    } finally {
      setBusy(false);
    }
  };
  const update = (id: number, value: GraderAccessSubmission["decisions"][number]) => {
    const next = [...decisions.filter((d) => d.githubUserId !== id), value];
    setDecisions(next);
    onCompleted?.(false);
    onReview?.(null);
    if (context && onSave)
      saves.current = onSave({
        ...bound,
        submission: { inventoryId: context.inventoryId, decisions: next }
      });
    setResult(null);
  };
  return (
    <section className="detail-panel">
      <h2>Legacy grader access</h2>
      <p>
        Complete migration review first, then load the read-only inventory. Every verified member
        needs an explicit disposition. Grader membership grants no faculty role.
      </p>
      <p>
        To add a faculty identity, use Faculty with an explicit institutional username and
        Verify/Add faculty, then complete the reset migration review and reload this inventory.
      </p>
      <button
        type="button"
        disabled={!enabled || busy}
        onClick={() => {
          void load();
        }}
      >
        Load grader inventory
      </button>
      {message ? <p role="alert">{message}</p> : null}
      {context ? (
        <fieldset disabled={busy || !enabled}>
          <p>
            Inventory: {context.inventory.status}. Legacy team:{" "}
            {context.inventory.candidate?.slug ?? "none verified"} · ID{" "}
            {context.inventory.candidate?.teamId ?? "unknown"}.
          </p>
          <h3>Legacy access to retire in a later cleanup step</h3>
          <ul>
            {context.inventory.evidence.map((e, i) => (
              <li key={i}>
                {e.location} · {e.provenance}: team {e.team ?? "unknown"}, permission{" "}
                {e.permission ?? "unknown"}
              </li>
            ))}
          </ul>
          <ul>
            {context.inventory.repositories.map((repo) => (
              <li key={repo.repositoryId}>
                Repository {repo.owner}/{repo.name} · ID {repo.repositoryId}:{" "}
                {repo.associations
                  .filter((a) => a.legacyCandidate)
                  .map((a) => `${a.slug} (team ${a.teamId}), ${a.permission}`)
                  .join("; ") || "No verified legacy association"}
              </li>
            ))}
          </ul>
          {context.inventory.findings.map((finding, i) => (
            <p key={i}>
              {finding.classification}: {finding.code} — {finding.location}
            </p>
          ))}
          {context.inventory.candidate?.members.length === 0 ||
          context.inventory.status === "not_applicable" ? (
            <p>No verified legacy members require a disposition.</p>
          ) : null}
          {context.inventory.candidate?.members.map((member) => {
            const decision = decisions.find((d) => d.githubUserId === member.id);
            const existing = context.review.terms.flatMap((t) =>
              t.sections
                .filter((s) => s.currentFacultyGithubUserIds?.includes(member.id))
                .map((s) => `${t.termCode} / ${s.sectionId}`)
            );
            const verified = context.review.facultyDirectory.some(
              (f) => f.github_user_id === member.id
            );
            return (
              <fieldset key={member.id}>
                <legend>
                  {member.login} · GitHub ID {member.id}
                </legend>
                <p>Already reviewed section faculty: {existing.join(", ") || "none"}.</p>
                <label>
                  Disposition for {member.login}
                  <select
                    value={decision?.disposition ?? ""}
                    onChange={(e) => {
                      const disposition = e.target.value;
                      if (
                        disposition === "existing_sufficient" ||
                        disposition === "no_access" ||
                        disposition === "assign"
                      )
                        update(member.id, { githubUserId: member.id, disposition, sections: [] });
                    }}
                  >
                    <option value="">Choose explicitly</option>
                    <option value="existing_sufficient" disabled={existing.length === 0}>
                      Existing section assignments are sufficient
                    </option>
                    <option value="no_access" disabled={existing.length > 0}>
                      No section faculty access should remain
                    </option>
                    <option value="assign" disabled={!verified}>
                      Assign selected exact sections
                    </option>
                  </select>
                </label>
                {!verified ? (
                  <p>
                    Verify and explicitly add this identity in Faculty before assigning sections.
                  </p>
                ) : null}
                {decision?.disposition === "assign"
                  ? context.review.terms.map((term) => (
                      <fieldset key={term.termCode}>
                        <legend>
                          {term.termCode} · {term.status}
                        </legend>
                        {term.status === "archived" ? (
                          <p>
                            Selection confirms normal completion of this historical section
                            relationship, retained as current. It creates no removed-mid-term
                            history or timestamps.
                          </p>
                        ) : (
                          <p>Selection adds a current section-faculty relationship.</p>
                        )}
                        {term.sections.map((section) => (
                          <label key={section.sectionId}>
                            <input
                              type="checkbox"
                              aria-label={`${member.login} ${term.termCode} section ${section.sectionId}`}
                              checked={decision.sections.some(
                                (s) =>
                                  s.termCode === term.termCode && s.sectionId === section.sectionId
                              )}
                              onChange={(e) =>
                                update(member.id, {
                                  ...decision,
                                  sections: e.target.checked
                                    ? [
                                        ...decision.sections,
                                        { termCode: term.termCode, sectionId: section.sectionId }
                                      ]
                                    : decision.sections.filter(
                                        (s) =>
                                          s.termCode !== term.termCode ||
                                          s.sectionId !== section.sectionId
                                      )
                                })
                              }
                            />
                            Section {section.sectionId}
                          </label>
                        ))}
                      </fieldset>
                    ))
                  : null}
              </fieldset>
            );
          })}
          <button
            type="button"
            onClick={() => {
              void complete();
            }}
          >
            Complete grader access review
          </button>
          {result ? (
            <div role="status">
              <p>Grader access review: {result.status}. Publication remains unavailable.</p>
              {result.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
              {result.missingMemberIds.map((id) => (
                <p key={id}>Disposition required for GitHub ID {id}.</p>
              ))}
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </section>
  );
};
