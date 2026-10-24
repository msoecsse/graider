import { useEffect, useRef, useState } from "react";
import type {
  ImportAssignment,
  ImportPreview,
  ImportResult,
  ImportSelection,
  FindingPlan
} from "../../electron/reviewImportService";
import { FormattedGradingComment } from "../grading-workspace/FormattedGradingComment";
import "./reviewImport.css";
const selectionId = (reviewIndex: number, key: string): string =>
  JSON.stringify([reviewIndex, key]);
const statusLabels = {
  ready: "Ready",
  warning: "Warnings / Approval Required",
  duplicate: "Duplicates",
  unmatched: "Unmatched",
  invalid: "Invalid"
} as const;
const Diagnostics = ({
  items
}: {
  readonly items: readonly { readonly code: string; readonly message: string }[];
}) => (
  <ul className="review-import__diagnostics">
    {items.map((item, index) => (
      <li key={index}>{item.message}</li>
    ))}
  </ul>
);
export const ReviewImportWorkflow = ({
  request,
  onApplied,
  disabled = false
}: {
  readonly request: ImportAssignment;
  readonly onApplied: (result: ImportResult) => Promise<void>;
  readonly disabled?: boolean;
}) => {
  const [preview, setPreview] = useState<ImportPreview>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult>();
  const [error, setError] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview !== undefined) dialogRef.current?.showModal();
  }, [preview]);
  useEffect(
    () => () => {
      void window.graiderUI.closeReviewImport?.();
    },
    []
  );
  const available = (finding: FindingPlan, id: string): boolean =>
    finding.eligibleToApply && (!finding.requiresApproval || approved.has(id));
  const readySelections = (value: ImportPreview): Set<string> =>
    new Set(
      value.plan.reviews.flatMap((review, index) =>
        review.findings
          .filter(
            (finding) =>
              finding.eligibleToApply && !finding.requiresApproval && finding.status === "ready"
          )
          .map((finding) => selectionId(index, finding.key))
      )
    );
  const choose = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const value = await window.graiderUI.chooseReviewImport?.(request);
      if (value != null) {
        setPreview(value);
        setSelected(readySelections(value));
        setApproved(new Set());
        setResult(undefined);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Review planning failed.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = (ids: readonly string[], checked: boolean): void => {
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };
  const close = (): void => {
    if (!busy) {
      dialogRef.current?.close();
      setPreview(undefined);
      setSelected(new Set());
      setApproved(new Set());
      setResult(undefined);
      setError(undefined);
      void window.graiderUI.closeReviewImport?.();
    }
  };
  const apply = async (): Promise<void> => {
    if (
      preview !== undefined &&
      selected.size > 0 &&
      window.graiderUI.applyReviewImport !== undefined
    ) {
      setBusy(true);
      setError(undefined);
      const selections: ImportSelection[] = preview.plan.reviews.flatMap((review, index) =>
        review.findings.flatMap((finding) => {
          const id = selectionId(index, finding.key);
          return selected.has(id) && available(finding, id) && review.matchedStudent !== undefined
            ? [
                {
                  reviewIndex: index,
                  studentId: review.matchedStudent.studentId,
                  findingKey: finding.key,
                  approved: approved.has(id)
                }
              ]
            : [];
        })
      );
      try {
        const applied = await window.graiderUI.applyReviewImport({
          ...request,
          planId: preview.planId,
          version: preview.version,
          selections
        });
        setResult(applied);
        setSelected(new Set());
        try {
          await onApplied(applied);
        } catch {
          setError(
            "Reviews were saved, but grading details could not be refreshed. Reopen the grading workspace to see them."
          );
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : "Review application failed.");
      } finally {
        setBusy(false);
      }
    }
  };
  return (
    <>
      <button
        type="button"
        className="secondary-action"
        disabled={disabled || busy || window.graiderUI.chooseReviewImport === undefined}
        onClick={() => void choose()}
      >
        {busy && preview === undefined ? "Planning reviews…" : "Import Reviews..."}
      </button>
      {preview === undefined && error !== undefined ? <p role="alert">{error}</p> : null}
      {preview === undefined ? null : (
        <dialog
          ref={dialogRef}
          className="review-import"
          aria-labelledby="review-import-title"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <div className="review-import__layout">
            <header>
              <h2 id="review-import-title">Review Import Preview</h2>
              <p>Review and select feedback before adding it to grading.</p>
              <div className="review-import__summary">
                {(Object.keys(statusLabels) as (keyof typeof statusLabels)[]).map((status) => (
                  <span
                    key={status}
                    className={`review-import__status review-import__status--${status}`}
                  >
                    {statusLabels[status]}: {preview.plan.summary[status]}
                  </span>
                ))}
              </div>
              <p>
                {preview.plan.summary.totalFiles} review files ·{" "}
                {
                  new Set(
                    preview.plan.reviews.flatMap((review) =>
                      review.matchedStudent === undefined ? [] : [review.matchedStudent.studentId]
                    )
                  ).size
                }{" "}
                matched students ·{" "}
                {preview.plan.reviews.reduce((total, review) => total + review.findings.length, 0)}{" "}
                proposed findings · {selected.size} selected findings
              </p>
              <Diagnostics items={preview.plan.diagnostics} />
              {result === undefined ? (
                <div className="review-import__actions">
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={busy}
                    onClick={() => setSelected(readySelections(preview))}
                  >
                    Select all Ready
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={busy}
                    onClick={() => setSelected(new Set())}
                  >
                    Clear selections
                  </button>
                </div>
              ) : null}
            </header>
            <div className="review-import__list">
              {error === undefined ? null : <p role="alert">{error}</p>}
              {result !== undefined ? (
                <section role="status">
                  <h3>Review import results</h3>
                  <p>
                    {result.applied} applied · {result.duplicatesSkipped} duplicates skipped ·{" "}
                    {result.failed} failed · {result.studentsAffected} students affected
                  </p>
                  <ul>
                    {result.outcomes.map((outcome, index) => (
                      <li key={index}>
                        {outcome.studentId} · {outcome.status}: {outcome.message}{" "}
                        <small>
                          {preview.plan.reviews
                            .flatMap((review) => review.findings)
                            .find((finding) => finding.key === outcome.findingKey)?.finding.title ??
                            outcome.findingKey}
                        </small>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <fieldset disabled={busy || result !== undefined}>
                {preview.plan.reviews.map((review, index) => {
                  const student = preview.students.find(
                    (student) => student.studentId === review.matchedStudent?.studentId
                  );
                  const selectable = review.findings
                    .filter((finding) => available(finding, selectionId(index, finding.key)))
                    .map((finding) => selectionId(index, finding.key));
                  return (
                    <article key={index} className="review-import__review">
                      <div className="review-import__row">
                        <input
                          type="checkbox"
                          aria-label={`Select review ${review.filename}`}
                          disabled={selectable.length === 0}
                          checked={
                            selectable.length > 0 && selectable.every((id) => selected.has(id))
                          }
                          ref={(input) => {
                            if (input !== null)
                              input.indeterminate =
                                selectable.some((id) => selected.has(id)) &&
                                !selectable.every((id) => selected.has(id));
                          }}
                          onChange={(event) => toggle(selectable, event.target.checked)}
                        />
                        <strong>
                          {student === undefined
                            ? (review.review?.student.displayName ?? review.filename)
                            : [student.firstName, student.lastName].filter(Boolean).join(" ") ||
                              student.studentId}
                        </strong>
                        <span
                          className={`review-import__status review-import__status--${review.status}`}
                        >
                          {review.status}
                        </span>
                      </div>
                      <p>
                        {review.filename} · GitHub:{" "}
                        {review.matchedStudent?.githubUsername ??
                          review.review?.student.githubUsername ??
                          "—"}{" "}
                        · MSOE/package:{" "}
                        {review.matchedStudent?.studentId ??
                          review.review?.student.studentId ??
                          "—"}{" "}
                        · Section: {student?.section ?? "—"}
                      </p>
                      {review.review === undefined ? null : (
                        <p>
                          Repository: {review.review.repository.owner}/
                          {review.review.repository.name}
                          <br />
                          Reviewed SHA: <code>{review.review.repository.reviewedCommitSha}</code>
                          <br />
                          Current canonical SHA:{" "}
                          <code>{review.currentCommitSha ?? "Unavailable"}</code> ·{" "}
                          {review.shaState}
                        </p>
                      )}
                      <p>
                        {review.findings.length} findings ·{" "}
                        {review.findings.filter((finding) => finding.eligibleToApply).length}{" "}
                        eligible · {review.findingCounts.duplicate} duplicate ·{" "}
                        {
                          review.findings.filter(
                            (finding) => finding.eligibleToApply && finding.requiresApproval
                          ).length
                        }{" "}
                        requiring approval
                      </p>
                      <Diagnostics items={review.diagnostics} />
                      <details>
                        <summary>Findings ({review.findings.length})</summary>
                        {review.findings.map((finding) => {
                          const id = selectionId(index, finding.key);
                          const location = finding.anchor.proposed;
                          return (
                            <section className="review-import__finding" key={finding.key}>
                              <label>
                                <input
                                  type="checkbox"
                                  aria-label={`Select finding ${finding.finding.title ?? finding.finding.id}`}
                                  disabled={!available(finding, id)}
                                  checked={selected.has(id)}
                                  onChange={(event) => toggle([id], event.target.checked)}
                                />{" "}
                                <strong>{finding.finding.title ?? finding.finding.id}</strong> ·{" "}
                                {finding.status}
                              </label>
                              <FormattedGradingComment text={finding.finding.text ?? ""} />
                              <p>
                                Deduction: {finding.finding.deduction} · Rubric:{" "}
                                {finding.rubric.categoryId ?? "General"} ({finding.rubric.status})
                                {finding.finding.rubric?.name === undefined
                                  ? ""
                                  : ` · ${finding.finding.rubric.name}`}{" "}
                                · Tags: {finding.finding.tags?.join(", ") || "—"}
                              </p>
                              <p>
                                Anchor: {finding.anchor.status} ·{" "}
                                {location === undefined
                                  ? finding.anchor.status === "general"
                                    ? "General comment (no source location)"
                                    : "No validated source location"
                                  : `${location.file}:${location.startLine}–${location.endLine}`}
                              </p>
                              {finding.anchor.original === undefined ? null : (
                                <>
                                  <p>
                                    Reviewed source: {finding.anchor.original.file}:
                                    {finding.anchor.original.startLine}–
                                    {finding.anchor.original.endLine}
                                  </p>
                                  <pre>{finding.anchor.original.excerpt}</pre>
                                </>
                              )}
                              <Diagnostics items={finding.diagnostics} />
                              {finding.eligibleToApply && finding.requiresApproval ? (
                                <label className="review-import__approval">
                                  <input
                                    type="checkbox"
                                    aria-label={`Approve ${finding.finding.title ?? finding.finding.id}`}
                                    checked={approved.has(id)}
                                    onChange={(event) => {
                                      const checked = event.target.checked;
                                      setApproved((current) => {
                                        const next = new Set(current);
                                        if (checked) next.add(id);
                                        else next.delete(id);
                                        return next;
                                      });
                                      toggle([id], checked);
                                    }}
                                  />
                                  {finding.recoveryRequired
                                    ? "Process with recovery"
                                    : "Approve warning / rubric mapping"}
                                </label>
                              ) : null}
                              {!finding.eligibleToApply ? (
                                <p>
                                  {finding.duplicate
                                    ? "Already imported — preserved."
                                    : "Blocked by validation; cannot apply."}
                                </p>
                              ) : null}
                            </section>
                          );
                        })}
                      </details>
                    </article>
                  );
                })}
              </fieldset>
            </div>
            <footer className="review-import__actions">
              <button type="button" className="secondary-action" disabled={busy} onClick={close}>
                {result === undefined ? "Cancel" : "Close"}
              </button>
              {result === undefined ? (
                <button
                  type="button"
                  className="primary-action"
                  disabled={busy || selected.size === 0}
                  onClick={() => void apply()}
                >
                  {busy ? "Applying reviews…" : "Apply Reviews"}
                </button>
              ) : null}
            </footer>
          </div>
        </dialog>
      )}
    </>
  );
};
