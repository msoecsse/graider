import type { ReactElement } from "react";
import type { DashboardCard, DashboardDiagnostic } from "./dashboardTypes";

interface DiagnosticsPanelProps {
  readonly card: DashboardCard;
}

const getDiagnosticTitle = (diagnostic: DashboardDiagnostic): string => {
  const parts = [diagnostic.severity, diagnostic.code].filter(
    (part): part is string => part !== null
  );

  return parts.length > 0 ? parts.join(" · ") : "diagnostic";
};

const getAssignmentTitle = (assignment: DashboardCard["assignments"][number]): string =>
  assignment.title ?? assignment.slug ?? assignment.assignmentFile ?? "Untitled assignment";

export const getCardDiagnosticCount = (card: DashboardCard): number =>
  card.diagnostics.length +
  card.assignments.reduce((count, assignment) => count + assignment.diagnostics.length, 0);

export const DiagnosticsPanel = ({ card }: DiagnosticsPanelProps): ReactElement | null => {
  const diagnosticCount = getCardDiagnosticCount(card);
  const hasActionableDiagnostic = [
    ...card.diagnostics,
    ...card.assignments.flatMap((assignment) => assignment.diagnostics)
  ].some((diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "warning");

  if (diagnosticCount === 0) {
    return null;
  }

  return (
    <details className="diagnostics-panel" open={hasActionableDiagnostic}>
      <summary>View diagnostics</summary>
      <div className="diagnostics-panel__content">
        {card.diagnostics.length > 0 ? (
          <ul className="diagnostics-list" aria-label="Course-term diagnostics">
            {card.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code ?? "card"}-${index}`}>
                <span className="diagnostics-list__title">{getDiagnosticTitle(diagnostic)}</span>
                <span>{diagnostic.message}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {card.assignments.map((assignment) =>
          assignment.diagnostics.length > 0 ? (
            <div
              className="diagnostics-panel__assignment"
              key={assignment.slug ?? assignment.assignmentFile ?? getAssignmentTitle(assignment)}
            >
              <h4>{getAssignmentTitle(assignment)}</h4>
              <ul className="diagnostics-list">
                {assignment.diagnostics.map((diagnostic, index) => (
                  <li key={`${diagnostic.code ?? "assignment"}-${index}`}>
                    <span className="diagnostics-list__title">
                      {getDiagnosticTitle(diagnostic)}
                    </span>
                    <span>{diagnostic.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        )}
      </div>
    </details>
  );
};
