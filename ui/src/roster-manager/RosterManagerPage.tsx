import { useEffect, useMemo, useState, type ChangeEvent, type ReactElement } from "react";
import type {
  AssignmentSetupTerm,
  CourseFolderRecord,
  RosterPreviewResult,
  RosterRemoveRequest,
  RosterRow,
  RosterSaveRequest
} from "../../electron/ipc";
import { ConfirmationWithPreviewModal } from "../components/ConfirmationWithPreviewModal";

const HEADERS = [
  ["studentId", "student_id"],
  ["githubUsername", "github_username"],
  ["section", "section"],
  ["status", "status"]
] as const;
const MVP_ROSTER_HEADERS = ["student_id", "github_username", "section", "status"] as const;
const LEGACY_ROSTER_HEADERS = [
  "student_id",
  "github_username",
  "email",
  "first_name",
  "last_name",
  "section",
  "status"
] as const;

const emptyRow = (section: string): RosterRow => ({
  studentId: "",
  githubUsername: "",
  section,
  status: "active"
});

const parseUploadedRoster = (content: string, sectionId: string): RosterRow[] | null => {
  const lines = content.split(/\r?\n/u).filter((line) => line.length > 0);
  const isLegacyHeader = lines[0] === LEGACY_ROSTER_HEADERS.join(",");
  if (lines[0] !== MVP_ROSTER_HEADERS.join(",") && !isLegacyHeader) return null;
  const headers = isLegacyHeader ? LEGACY_ROSTER_HEADERS : MVP_ROSTER_HEADERS;
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return {
      studentId: values[headers.indexOf("student_id")] ?? "",
      githubUsername: values[headers.indexOf("github_username")] ?? "",
      section: values[headers.indexOf("section")] ?? sectionId,
      status: values[headers.indexOf("status")] ?? "active"
    };
  });
};

export const RosterManagerPage = ({
  courseFolder,
  onBack,
  onSaved
}: {
  readonly courseFolder: CourseFolderRecord;
  readonly onBack: () => void;
  readonly onSaved: () => void;
}): ReactElement => {
  const [terms, setTerms] = useState<readonly AssignmentSetupTerm[]>([]);
  const [termCode, setTermCode] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [rows, setRows] = useState<readonly RosterRow[]>([]);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [isExisting, setIsExisting] = useState(false);
  const [changeDescription, setChangeDescription] = useState<string | null>(null);
  const [preview, setPreview] = useState<RosterPreviewResult | null>(null);
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmingRosterRemoval, setIsConfirmingRosterRemoval] = useState(false);
  const [isRosterRemovalConfirmed, setIsRosterRemovalConfirmed] = useState(false);
  const [isRemovingRoster, setIsRemovingRoster] = useState(false);
  const [isConfirmingSectionRemoval, setIsConfirmingSectionRemoval] = useState(false);
  const [isSectionRemovalConfirmed, setIsSectionRemovalConfirmed] = useState(false);
  const [isRemovingSection, setIsRemovingSection] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadRosterTerms = window.graiderUI.loadRosterTerms;
    if (loadRosterTerms === undefined) {
      setLoadMessage("Roster management is unavailable in this app build.");
      return;
    }
    void loadRosterTerms({ courseFolderId: courseFolder.id, courseFolderPath: courseFolder.path })
      .then((result) => {
        setTerms(result.terms);
        setLoadMessage(result.diagnostics.map((item) => item.message).join(" ") || null);
      })
      .catch(() => setLoadMessage("Unable to load terms for this course."));
  }, [courseFolder.id, courseFolder.path]);

  const selectedTerm = terms.find((term) => term.code === termCode) ?? null;
  const request = useMemo<RosterSaveRequest>(
    () => ({
      courseFolderId: courseFolder.id,
      courseFolderPath: courseFolder.path,
      termCode,
      sectionId,
      rows,
      createSection: isCreatingSection,
      confirmed: false
    }),
    [courseFolder.id, courseFolder.path, isCreatingSection, rows, sectionId, termCode]
  );

  const clearPreview = (): void => {
    setPreview(null);
    setIsConfirmingSave(false);
  };

  const handleTermChange = (value: string): void => {
    setTermCode(value);
    setSectionId("");
    setRows([]);
    setIsCreatingSection(false);
    setIsExisting(false);
    setChangeDescription(null);
    setLoadMessage(null);
    clearPreview();
  };

  const loadSection = async (value: string): Promise<void> => {
    setSectionId(value);
    setIsCreatingSection(false);
    setRows([]);
    setIsExisting(false);
    setChangeDescription(null);
    clearPreview();
    if (value.length === 0 || termCode.length === 0) return;
    const getRosterForSection = window.graiderUI.getRosterForSection;
    if (getRosterForSection === undefined) {
      setLoadMessage("Roster management is unavailable in this app build.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await getRosterForSection({ ...request, sectionId: value });
      setRows(result.rows);
      setIsExisting(result.exists);
      setLoadMessage(result.diagnostics.map((item) => item.message).join(" ") || null);
    } catch {
      setLoadMessage("Unable to load roster CSV.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateRow = (index: number, field: keyof RosterRow, value: string): void => {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
    setChangeDescription(null);
    clearPreview();
  };

  const replaceFromCsv = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    void file.text().then((content) => {
      const uploadedRows = parseUploadedRoster(content, sectionId);
      if (uploadedRows === null) {
        setLoadMessage("Uploaded roster must use the canonical four-column Graider header.");
        return;
      }
      setRows(uploadedRows);
      setChangeDescription(
        "This preview replaces the current roster content with the uploaded CSV."
      );
      setLoadMessage(null);
      clearPreview();
    });
  };

  const handlePreview = async (): Promise<void> => {
    const previewRosterSave = window.graiderUI.previewRosterSave;
    if (previewRosterSave === undefined) return;
    setIsLoading(true);
    setLoadMessage(null);
    try {
      const nextPreview = await previewRosterSave(request);
      setPreview(nextPreview);
      if (nextPreview.status === "ready") {
        setIsConfirmingSave(true);
      } else {
        setLoadMessage(nextPreview.diagnostics.map((item) => item.message).join(" "));
      }
    } catch {
      setLoadMessage("Unable to prepare roster preview.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    const saveRoster = window.graiderUI.saveRoster;
    if (saveRoster === undefined)
      throw new Error("Roster management is unavailable in this app build.");
    if (preview?.status !== "ready")
      throw new Error("Prepare a valid roster preview before saving.");
    setIsLoading(true);
    try {
      const result = await saveRoster({ ...request, confirmed: true });
      if (result.status === "success") {
        setMessage(`Saved ${result.path}`);
        setIsExisting(true);
        if (isCreatingSection) {
          setTerms((current) =>
            current.map((term) =>
              term.code === termCode ? { ...term, sections: [...term.sections, sectionId] } : term
            )
          );
          setIsCreatingSection(false);
        }
        onSaved();
      } else {
        throw new Error(result.diagnostics.map((item) => item.message).join(" "));
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unable to save roster CSV.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveRoster = async (): Promise<void> => {
    const removeRoster = window.graiderUI.removeRoster;
    if (removeRoster === undefined || !isRosterRemovalConfirmed) return;
    setIsRemovingRoster(true);
    setMessage(null);
    const removeRequest: RosterRemoveRequest = {
      courseFolderId: courseFolder.id,
      courseFolderPath: courseFolder.path,
      termCode,
      sectionId,
      confirmed: true
    };
    try {
      const result = await removeRoster(removeRequest);
      if (result.status === "success") {
        setTerms((current) =>
          current.map((term) =>
            term.code === termCode
              ? { ...term, sections: term.sections.filter((section) => section !== sectionId) }
              : term
          )
        );
        setSectionId("");
        setRows([]);
        setIsExisting(false);
        setChangeDescription(null);
        clearPreview();
        setIsConfirmingRosterRemoval(false);
        setIsRosterRemovalConfirmed(false);
        setMessage(`Removed ${result.path}`);
        onSaved();
      } else {
        setMessage(result.diagnostics.map((item) => item.message).join(" "));
      }
    } catch {
      setMessage("Unable to remove roster CSV.");
    } finally {
      setIsRemovingRoster(false);
    }
  };

  const handleRemoveSection = async (): Promise<void> => {
    const removeSection = window.graiderUI.removeSection;
    if (removeSection === undefined || !isSectionRemovalConfirmed) return;
    setIsRemovingSection(true);
    setMessage(null);
    const removeRequest: RosterRemoveRequest = {
      courseFolderId: courseFolder.id,
      courseFolderPath: courseFolder.path,
      termCode,
      sectionId,
      confirmed: true
    };
    try {
      const result = await removeSection(removeRequest);
      if (result.status === "success") {
        setTerms((current) =>
          current.map((term) =>
            term.code === termCode
              ? { ...term, sections: term.sections.filter((section) => section !== sectionId) }
              : term
          )
        );
        setSectionId("");
        setRows([]);
        setIsExisting(false);
        setChangeDescription(null);
        clearPreview();
        setIsConfirmingSectionRemoval(false);
        setIsSectionRemovalConfirmed(false);
        setMessage(`Removed section ${sectionId}`);
        onSaved();
      } else {
        setMessage(result.diagnostics.map((item) => item.message).join(" "));
      }
    } catch {
      setMessage("Unable to remove section.");
    } finally {
      setIsRemovingSection(false);
    }
  };

  const targetPath =
    termCode.length > 0 && sectionId.length > 0
      ? `terms/${termCode}/rosters/section-${sectionId}.csv`
      : null;

  return (
    <main className="dashboard-shell" aria-labelledby="roster-manager-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="roster-manager-title">Manage rosters</h1>
            <p className="assignment-detail__subtitle">{courseFolder.path}</p>
          </div>
          <button className="secondary-action" type="button" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
      </header>
      <section className="dashboard-content roster-manager" aria-label="Roster manager">
        <section className="detail-panel roster-manager__selection">
          <label>
            Term
            <select value={termCode} onChange={(event) => handleTermChange(event.target.value)}>
              <option value="">Select a term</option>
              {terms.map((term) => (
                <option key={term.code} value={term.code}>
                  {term.code}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-action"
            type="button"
            disabled={selectedTerm === null}
            onClick={() => {
              setSectionId("");
              setRows([]);
              setIsExisting(false);
              setIsCreatingSection(true);
              clearPreview();
            }}
          >
            Add Section
          </button>
          {isCreatingSection ? (
            <>
              <label>
                New section ID
                <input
                  value={sectionId}
                  placeholder="111"
                  onChange={(event) => {
                    setSectionId(event.target.value);
                    setRows((current) =>
                      current.map((row) => ({ ...row, section: event.target.value }))
                    );
                    clearPreview();
                  }}
                />
              </label>
              <label>
                Roster CSV (optional)
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    replaceFromCsv(event);
                  }}
                />
              </label>
            </>
          ) : null}
          <label>
            Section
            <select
              value={sectionId}
              disabled={selectedTerm === null}
              onChange={(event) => {
                void loadSection(event.target.value);
              }}
            >
              <option value="">Select a section</option>
              {selectedTerm?.sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </label>
          {targetPath === null ? null : <p className="assignment-detail__path">{targetPath}</p>}
          {loadMessage === null ? null : (
            <p className="error-message" role="alert">
              {loadMessage}
            </p>
          )}
          {targetPath === null ? null : (
            <p className="detail-panel__note">
              {isExisting ? "Updating existing roster." : "A new roster will be created."}
            </p>
          )}
        </section>
        {sectionId.length === 0 ? null : (
          <section className="detail-panel">
            <div className="roster-manager__table-header">
              <h2>Students</h2>
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  setRows((current) => [...current, emptyRow(sectionId)]);
                  setChangeDescription("This change adds a student row to the roster.");
                  clearPreview();
                }}
              >
                Add Student
              </button>
            </div>
            <div className="roster-manager__table-wrap">
              <table>
                <thead>
                  <tr>
                    {HEADERS.map(([, label]) => (
                      <th key={label}>{label}</th>
                    ))}
                    <th>
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      {HEADERS.map(([field, label]) => (
                        <td key={label}>
                          {field === "section" ? (
                            <input
                              aria-label={`${label} row ${String(index + 1)}`}
                              value={row.section}
                              readOnly
                            />
                          ) : field === "status" ? (
                            <select
                              aria-label={`${label} row ${String(index + 1)}`}
                              value={row.status}
                              onChange={(event) => updateRow(index, field, event.target.value)}
                            >
                              <option value="active">active</option>
                              <option value="dropped">dropped</option>
                              <option value="hold">hold</option>
                            </select>
                          ) : (
                            <input
                              aria-label={`${label} row ${String(index + 1)}`}
                              value={row[field]}
                              onChange={(event) => updateRow(index, field, event.target.value)}
                            />
                          )}
                        </td>
                      ))}
                      <td>
                        <button
                          className="danger-action"
                          type="button"
                          aria-label={`Remove Student ${String(index + 1)}`}
                          onClick={() => {
                            setRows((current) =>
                              current.filter((_, rowIndex) => rowIndex !== index)
                            );
                            setChangeDescription("This preview removes the selected student row.");
                            clearPreview();
                          }}
                        >
                          Remove Student
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {sectionId.length === 0 || isCreatingSection ? null : (
          <section className="detail-panel">
            <h2>Roster CSV actions</h2>
            <label>
              Replace from CSV
              <input type="file" accept=".csv,text/csv" onChange={replaceFromCsv} />
            </label>
            <button
              className="danger-action"
              type="button"
              disabled={rows.length === 0}
              onClick={() => {
                setRows([]);
                setChangeDescription(
                  "This preview clears all roster rows and keeps the section's header-only CSV."
                );
                clearPreview();
              }}
            >
              Clear Roster Rows
            </button>
            <button
              className="danger-action"
              type="button"
              disabled={!isExisting || isLoading || isRemovingRoster}
              onClick={() => {
                setIsConfirmingRosterRemoval(true);
                setIsRosterRemovalConfirmed(false);
                setMessage(null);
              }}
            >
              Remove Roster
            </button>
            <button
              className="danger-action"
              type="button"
              disabled={isLoading || isRemovingSection}
              onClick={() => {
                setIsConfirmingSectionRemoval(true);
                setIsSectionRemovalConfirmed(false);
                setMessage(null);
              }}
            >
              Remove Section
            </button>
          </section>
        )}
        {!isConfirmingRosterRemoval ? null : (
          <section className="detail-panel" role="dialog" aria-labelledby="remove-roster-title">
            <h2 id="remove-roster-title">Remove roster</h2>
            <p>
              This deletes {targetPath} and removes its section from term.yml. It does not remove
              any student repositories.
            </p>
            <label className="confirmation-check">
              <input
                type="checkbox"
                checked={isRosterRemovalConfirmed}
                onChange={(event) => setIsRosterRemovalConfirmed(event.target.checked)}
              />
              I understand this removes the entire roster.
            </label>
            <div className="apply-confirmation-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={isRemovingRoster}
                onClick={() => {
                  setIsConfirmingRosterRemoval(false);
                  setIsRosterRemovalConfirmed(false);
                }}
              >
                Cancel
              </button>
              <button
                className="danger-action"
                type="button"
                disabled={!isRosterRemovalConfirmed || isRemovingRoster}
                onClick={() => void handleRemoveRoster()}
              >
                {isRemovingRoster ? "Removing roster..." : "Remove roster"}
              </button>
            </div>
          </section>
        )}
        {!isConfirmingSectionRemoval ? null : (
          <section className="detail-panel" role="dialog" aria-labelledby="remove-section-title">
            <h2 id="remove-section-title">Remove section</h2>
            <p>
              This removes section {sectionId} from term.yml and deletes its roster CSV if present.
              It does not remove any student repositories.
            </p>
            <label className="confirmation-check">
              <input
                type="checkbox"
                checked={isSectionRemovalConfirmed}
                onChange={(event) => setIsSectionRemovalConfirmed(event.target.checked)}
              />
              I understand this removes the entire section.
            </label>
            <div className="apply-confirmation-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={isRemovingSection}
                onClick={() => {
                  setIsConfirmingSectionRemoval(false);
                  setIsSectionRemovalConfirmed(false);
                }}
              >
                Cancel
              </button>
              <button
                className="danger-action"
                type="button"
                disabled={!isSectionRemovalConfirmed || isRemovingSection}
                onClick={() => void handleRemoveSection()}
              >
                {isRemovingSection ? "Removing section..." : "Remove section"}
              </button>
            </div>
          </section>
        )}
        {sectionId.length === 0 ? null : (
          <section className="detail-panel">
            <h2>Save roster</h2>
            <button
              className="primary-action"
              type="button"
              disabled={isLoading}
              onClick={() => {
                void handlePreview();
              }}
            >
              {isLoading ? "Preparing preview..." : "Save roster"}
            </button>
            {message === null ? null : (
              <p className="success-message" role="status">
                {message}
              </p>
            )}
          </section>
        )}
      </section>
      <ConfirmationWithPreviewModal
        confirmLabel="Save roster"
        isOpen={isConfirmingSave && preview !== null}
        onCancel={() => setIsConfirmingSave(false)}
        onConfirm={handleSave}
        preview={preview === null ? undefined : <pre>{preview.content}</pre>}
        summary={
          changeDescription ??
          `${preview?.exists === true || isExisting ? "Update" : "Create"} roster with ${rows.length} student record${rows.length === 1 ? "" : "s"}.`
        }
        title="Save roster changes?"
      />
    </main>
  );
};
