import type { ReactElement } from "react";
import type {
  CourseMigrationAnalysis,
  MigrationReviewAcknowledgement
} from "../../electron/migrationReviewService";
import {
  acknowledgementKey,
  requiredMigrationAcknowledgements
} from "../../../src/migration/migration-review-validation";

export const acknowledgementLabel = (kind: MigrationReviewAcknowledgement["kind"]): string =>
  kind === "ownerless_assignment"
    ? "I understand this ownerless assignment remains repair-required / read-only until coordinator repair."
    : kind === "legacy_closed"
      ? "I understand legacy closed lifecycle handling remains explicit and deferred; it is not mapped here."
      : "I understand group target mapping remains review-required; acknowledgement does not prove Complete Apply.";
const applyLabel = (state: string) =>
  ({
    not_observed: "Not observed",
    complete_evidence: "Complete evidence",
    partial_incomplete: "Partial / incomplete",
    ambiguous: "Ambiguous / needs attention"
  })[state] ?? state;

export const MigrationReviewEvidence = ({
  analysis,
  acknowledgements,
  onAcknowledgements
}: {
  readonly analysis: CourseMigrationAnalysis;
  readonly acknowledgements: readonly MigrationReviewAcknowledgement[];
  readonly onAcknowledgements: (value: readonly MigrationReviewAcknowledgement[]) => void;
}): ReactElement => {
  const required = requiredMigrationAcknowledgements(analysis);
  const login = (id: number) =>
    analysis.provisionalFacultyDirectory.value.find((entry) => entry.github_user_id === id)
      ?.github_login ?? String(id);
  return (
    <>
      <section className="detail-panel" aria-label="Organization migration condition">
        <h2>Organization migration condition</h2>
        <p>{analysis.organization.value}</p>
        {analysis.organization.value !== "organization_reconciled" ? (
          <p className="error-message">
            Schema publication remains blocked until organization identity/migration is reconciled.
            Review can continue. Acknowledgement cannot remove this blocker.
          </p>
        ) : null}
        <p>This page cannot initiate organization migration.</p>
      </section>
      {analysis.assignments.map((assignment) => (
        <section
          className="detail-panel"
          key={`${assignment.termCode}/${assignment.slug}`}
          aria-label={`${assignment.termCode}/${assignment.slug} assignment evidence`}
        >
          <h2>
            {assignment.termCode} / {assignment.slug} — {assignment.title}
          </h2>
          <dl className="detail-grid">
            <div>
              <dt>Legacy status / type</dt>
              <dd>
                {assignment.status} / {assignment.type}
              </dd>
            </div>
            <div>
              <dt>Sections</dt>
              <dd>{assignment.sections.join(", ")}</dd>
            </div>
            <div>
              <dt>Faculty owner</dt>
              <dd>
                {assignment.facultyOwner ?? "Ownerless"} →{" "}
                {assignment.owner.value === null
                  ? "Unresolved"
                  : assignment.owner.value.length === 0
                    ? "Repair-required / read-only"
                    : assignment.owner.value.map(login).join(", ")}
              </dd>
            </div>
            <div>
              <dt>Shared deadline</dt>
              <dd>
                {assignment.sharedDeadline.value.deadline
                  ? `${assignment.sharedDeadline.value.deadline.due_at} · ${assignment.sharedDeadline.value.deadline.late_policy}`
                  : "No deadline"}
              </dd>
            </div>
            <div>
              <dt>Later deadline destinations</dt>
              <dd>{assignment.sharedDeadline.value.copyToSections.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt>Repository mode</dt>
              <dd>{assignment.configurationEvidence.value.repository_mode ?? "individual"}</dd>
            </div>
            <div>
              <dt>Apply evidence</dt>
              <dd>{applyLabel(assignment.applyState)}</dd>
            </div>
          </dl>
          <p>
            Grading configuration:{" "}
            {JSON.stringify(
              assignment.configurationEvidence.value.grading ??
                analysis.courseConfigurationEvidence?.value.grading ??
                null
            )}
          </p>
          {assignment.groupFileEvidence ? (
            <p>
              Groups file: {assignment.groupFileEvidence.value.path} ·{" "}
              {assignment.groupFileEvidence.value.present
                ? "Observed; membership/target review remains required"
                : "Missing"}
            </p>
          ) : null}
          {analysis.issues
            .filter((issue) => issue.location.includes(`/${assignment.slug}`))
            .map((issue) => (
              <p key={`${issue.code}/${issue.location}`} role="note">
                {issue.message}
              </p>
            ))}
          {assignment.manifests.map((manifest) => (
            <details key={manifest.provenance}>
              <summary>
                {manifest.provenance === "source"
                  ? "Authoritative source"
                  : "Machine-local runtime"}
                :{" "}
                {manifest.state === "invalid"
                  ? "Invalid manifest"
                  : manifest.state === "missing"
                    ? "Missing manifest"
                    : applyLabel(manifest.applyState)}
              </summary>
              <p>{manifest.location}</p>
              {manifest.provenance === "runtime" ? (
                <p>Machine-local observation cannot establish completeness across machines.</p>
              ) : null}
              <ul>
                {manifest.sectionStates.map((section) => (
                  <li key={section.sectionId}>
                    Section {section.sectionId}: {applyLabel(section.state)}
                  </li>
                ))}
              </ul>
              <ul>
                {manifest.repositories.map((repository) => (
                  <li
                    key={`${repository.studentId}/${repository.sectionId}/${repository.repositoryName}`}
                  >
                    {repository.repositoryName} · immutable repository ID{" "}
                    {repository.repositoryId ?? "unavailable"} · section {repository.sectionId} ·{" "}
                    {repository.lifecycle}
                  </li>
                ))}
              </ul>
              <ul>
                {manifest.targets.map((target) => (
                  <li key={target.targetId}>
                    Target {target.targetId}: {target.repositoryName} · sections{" "}
                    {target.sectionIds.join(", ")} · students {target.studentIds.join(", ")} ·{" "}
                    {target.lifecycle ?? "unknown lifecycle"}
                  </li>
                ))}
              </ul>
              <ul>
                {manifest.operations.map((operation, index) => (
                  <li key={`${operation.startedAt}/${index}`}>
                    {operation.command}: {operation.status} ·{" "}
                    {operation.completed ? "completed" : "incomplete"}
                  </li>
                ))}
              </ul>
              <ul>
                {manifest.diagnostics.map((message, index) => (
                  <li key={`${index}/${message}`}>{message}</li>
                ))}
              </ul>
            </details>
          ))}
          {required
            .filter(
              (ack) =>
                ack.termCode === assignment.termCode && ack.assignmentSlug === assignment.slug
            )
            .map((ack) => {
              const key = acknowledgementKey(ack);
              return (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={acknowledgements.some((item) => acknowledgementKey(item) === key)}
                    onChange={(event) =>
                      onAcknowledgements(
                        event.target.checked
                          ? [...acknowledgements, ack]
                          : acknowledgements.filter((item) => acknowledgementKey(item) !== key)
                      )
                    }
                  />
                  {acknowledgementLabel(ack.kind)}
                </label>
              );
            })}
        </section>
      ))}
      {analysis.unassignedManifests.length > 0 ? (
        <section className="detail-panel">
          <h2>Orphan manifests</h2>
          {analysis.unassignedManifests.map((manifest) => (
            <p key={`${manifest.provenance}/${manifest.location}`}>
              {manifest.provenance}: {manifest.location} — {applyLabel(manifest.applyState)}.
              Requires later conversion review.
            </p>
          ))}
        </section>
      ) : null}
      <section className="detail-panel" aria-label="Historical grader debt">
        <h2>Historical grader debt</h2>
        <p>
          Grader is not a Schema v2 role. Phase 9.4 will remove/reconcile this historical
          configuration. No cleanup occurs during review.
        </p>
        {analysis.grader.evidence.length === 0 ? (
          <p>No persisted grader configuration observed.</p>
        ) : (
          <ul>
            {analysis.grader.evidence.map((item, index) => (
              <li key={`${index}/${item.location}`}>
                {item.location} · {item.provenance} · grader_team: {item.team ?? "absent"} ·
                grader_permission: {item.permission ?? "absent"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
};
