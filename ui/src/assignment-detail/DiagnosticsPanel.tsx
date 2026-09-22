import type { ReactElement } from "react";
import { DiagnosticEntry } from "./AssignmentDetailPrimitives";
import { groupDiagnostics } from "./assignmentDetailReadiness";
import type { AssignmentDetailDiagnostic } from "./assignmentDetailTypes";

export const DiagnosticsPanel = ({
  diagnostics
}: {
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="assignment-diagnostics-title">
    <h2 id="assignment-diagnostics-title">Diagnostics</h2>
    {diagnostics.length === 0 ? (
      <p className="detail-panel__note">No diagnostics.</p>
    ) : (
      <div className="diagnostic-groups">
        {groupDiagnostics(diagnostics).map((group) => (
          <section className="diagnostic-group" aria-label={group.label} key={group.key}>
            <h3>{group.label}</h3>
            <ul className="assignment-detail-diagnostics">
              {group.diagnostics.map((diagnostic, index) => (
                <DiagnosticEntry
                  diagnostic={diagnostic}
                  key={`${diagnostic.code ?? "diagnostic"}-${index}`}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    )}
  </section>
);
