import { useEffect, useMemo, useState, type ChangeEvent, type ReactElement } from "react";
import type {
  AssignmentSetupTerm,
  CourseFolderRecord,
  RosterPreviewResult,
  RosterRow,
  RosterSaveRequest
} from "../../electron/ipc";

const HEADERS = [
  ["studentId", "student_id"],
  ["githubUsername", "github_username"],
  ["email", "email"],
  ["firstName", "first_name"],
  ["lastName", "last_name"],
  ["section", "section"],
  ["status", "status"]
] as const;

const emptyRow = (section: string): RosterRow => ({
  studentId: "",
  githubUsername: "",
  email: "",
  firstName: "",
  lastName: "",
  section,
  status: "active"
});

const parseUploadedRoster = (content: string, sectionId: string): RosterRow[] | null => {
  const lines = content.split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines[0] !== "student_id,github_username,email,first_name,last_name,section,status")
    return null;
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return {
      studentId: values[0] ?? "",
      githubUsername: values[1] ?? "",
      email: values[2] ?? "",
      firstName: values[3] ?? "",
      lastName: values[4] ?? "",
      section: values[5] ?? sectionId,
      status: values[6] ?? "active"
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
  const [isLoading, setIsLoading] = useState(false);
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

  const clearPreview = (): void => setPreview(null);

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
        setLoadMessage("Uploaded roster must use the canonical seven-column Graider header.");
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
    setMessage(null);
    try {
      setPreview(await previewRosterSave(request));
    } catch {
      setMessage("Unable to prepare roster preview.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    const saveRoster = window.graiderUI.saveRoster;
    if (saveRoster === undefined || preview?.status !== "ready") return;
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
        setMessage(result.diagnostics.map((item) => item.message).join(" "));
      }
    } catch {
      setMessage("Unable to save roster CSV.");
    } finally {
      setIsLoading(false);
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
                  setChangeDescription(null);
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
          </section>
        )}
        {sectionId.length === 0 ? null : (
          <section className="detail-panel">
            <h2>Preview and save</h2>
            <button
              className="primary-action"
              type="button"
              disabled={isLoading}
              onClick={() => {
                void handlePreview();
              }}
            >
              {isLoading ? "Preparing preview..." : "Preview roster CSV"}
            </button>
            {preview === null ? null : (
              <>
                {changeDescription === null ? null : (
                  <p className="detail-panel__note">{changeDescription}</p>
                )}
                {preview.diagnostics.map((item) => (
                  <p className="error-message" role="alert" key={item.message}>
                    {item.message}
                  </p>
                ))}
                <details open>
                  <summary>
                    {preview.exists ? "Update: " : "Create: "}
                    {preview.path}
                  </summary>
                  <pre>{preview.content}</pre>
                </details>
                <button
                  className="primary-action"
                  type="button"
                  disabled={preview.status !== "ready" || isLoading}
                  onClick={() => {
                    void handleSave();
                  }}
                >
                  {isLoading ? "Saving..." : "Save Roster"}
                </button>
              </>
            )}
            {message === null ? null : (
              <p className="success-message" role="status">
                {message}
              </p>
            )}
          </section>
        )}
      </section>
    </main>
  );
};
