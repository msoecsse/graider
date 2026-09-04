import { useEffect, useMemo, useState, type ReactElement } from "react";
import type {
  AssignmentEditModel,
  AssignmentEditPreviewResult,
  AssignmentEditRequest
} from "../../electron/ipc";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import { ConfirmationWithPreviewModal } from "../components/ConfirmationWithPreviewModal";

const toDateTimeLocal = (value: string): string => value.replace(/(?:Z|[+-]\d{2}:\d{2})$/u, "");
const toIsoWithOffset = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)}${sign}${hours}:${minutes}`;
};

export const AssignmentEditPage = ({
  selection,
  onBack,
  onSaved
}: {
  readonly selection: AssignmentDetailSelection;
  readonly onBack: () => void;
  readonly onSaved: () => void;
}): ReactElement => {
  const [model, setModel] = useState<AssignmentEditModel | null>(null);
  const [terms, setTerms] = useState<
    readonly { readonly code: string; readonly sections: readonly string[] }[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<AssignmentEditPreviewResult | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<readonly string[]>([]);
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [latePolicy, setLatePolicy] = useState("");
  const [status, setStatus] = useState("active");
  const [gradingEnabled, setGradingEnabled] = useState(true);
  const [points, setPoints] = useState("");
  const [facultyOwner, setFacultyOwner] = useState("");
  const [lmsAssignmentId, setLmsAssignmentId] = useState("");
  const [gradingCategory, setGradingCategory] = useState("");
  useEffect(() => {
    const load = window.graiderUI.getAssignmentForEdit;
    if (load === undefined) {
      setMessage("Assignment editing is unavailable in this app build.");
      setLoading(false);
      return;
    }
    void load({
      courseFolderId: selection.courseFolderId,
      courseFolderPath: selection.courseFolderPath,
      assignmentFile: selection.assignmentFile
    })
      .then((result) => {
        setTerms(result.terms);
        setMessage(result.diagnostics.map((item) => item.message).join(" ") || null);
        if (result.model !== null) {
          const value = result.model;
          setModel(value);
          setTitle(value.assignmentTitle);
          setSections(value.sectionIds);
          setRepository(value.templateRepository);
          setBranch(value.templateBranch);
          setDueAt(toDateTimeLocal(value.dueAt));
          setLatePolicy(value.latePolicy);
          setStatus(value.assignmentStatus);
          setGradingEnabled(value.gradingEnabled);
          setPoints(value.points === null ? "" : String(value.points));
          setFacultyOwner(value.facultyOwner);
          setLmsAssignmentId(value.lmsAssignmentId ?? "");
          setGradingCategory(value.gradingCategory);
        }
      })
      .catch(() => setMessage("Unable to load assignment.yml for editing."))
      .finally(() => setLoading(false));
  }, [selection]);
  const request = useMemo<AssignmentEditRequest | null>(
    () =>
      model === null
        ? null
        : {
            courseFolderId: selection.courseFolderId,
            courseFolderPath: selection.courseFolderPath,
            assignmentFile: model.assignmentFile,
            assignmentTitle: title,
            sectionIds: sections,
            templateRepository: repository,
            templateBranch: branch,
            dueAt: toIsoWithOffset(dueAt),
            latePolicy,
            assignmentStatus: status,
            gradingEnabled,
            points: points.trim() === "" ? null : Number(points),
            facultyOwner,
            lmsAssignmentId,
            gradingCategory,
            originalContent: model.originalContent,
            confirmed: false
          },
    [
      branch,
      dueAt,
      facultyOwner,
      gradingCategory,
      gradingEnabled,
      latePolicy,
      lmsAssignmentId,
      model,
      points,
      repository,
      sections,
      selection,
      status,
      title
    ]
  );
  const clear = (): void => {
    setPreview(null);
    setIsConfirming(false);
  };
  const selectedTerm =
    model === null ? null : (terms.find((term) => term.code === model.termCode) ?? null);
  const save = async (): Promise<void> => {
    if (request === null || preview?.status !== "ready") {
      throw new Error("Prepare an assignment preview before saving.");
    }
    if (window.graiderUI.saveAssignmentEdit === undefined) {
      throw new Error("Assignment editing is unavailable in this app build.");
    }
    setLoading(true);
    try {
      const result = await window.graiderUI.saveAssignmentEdit({ ...request, confirmed: true });
      if (result.status === "success") onSaved();
      else throw new Error(result.diagnostics.map((item) => item.message).join(" "));
    } finally {
      setLoading(false);
    }
  };
  const previewSave = async (): Promise<void> => {
    if (request === null || window.graiderUI.previewAssignmentEdit === undefined) return;
    setLoading(true);
    try {
      const nextPreview = await window.graiderUI.previewAssignmentEdit(request);
      setPreview(nextPreview);
      if (nextPreview.status === "ready") setIsConfirming(true);
      else setMessage(nextPreview.diagnostics.map((item) => item.message).join(" "));
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="dashboard-shell" aria-labelledby="assignment-edit-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="assignment-edit-title">Edit Assignment</h1>
          </div>
          <button className="secondary-action" type="button" onClick={onBack}>
            Cancel
          </button>
        </div>
      </header>
      <section className="dashboard-content assignment-setup" aria-label="Edit assignment">
        {message === null ? null : (
          <p className="error-message" role="alert">
            {message}
          </p>
        )}
        {loading && model === null ? (
          <p className="loading-state">Loading assignment configuration...</p>
        ) : null}
        {model === null ? null : (
          <>
            <section className="detail-panel">
              <h2>Assignment basics</h2>
              <label>
                Assignment title
                <input
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    clear();
                  }}
                />
              </label>
              <label>
                Assignment slug
                <input value={model.assignmentSlug} readOnly />
              </label>
              <label>
                Term
                <input value={model.termCode} readOnly />
              </label>
              <label>
                Assignment status
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    clear();
                  }}
                >
                  {["draft", "active", "closed", "archived"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Due date and time
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => {
                    setDueAt(event.target.value);
                    clear();
                  }}
                />
              </label>
              <label>
                Late policy
                <input
                  value={latePolicy}
                  onChange={(event) => {
                    setLatePolicy(event.target.value);
                    clear();
                  }}
                />
              </label>
            </section>
            <section className="detail-panel">
              <h2>Sections</h2>
              {selectedTerm?.sections.map((section) => (
                <label className="assignment-setup__checkbox" key={section}>
                  <input
                    type="checkbox"
                    checked={sections.includes(section)}
                    onChange={() => {
                      setSections((current) =>
                        current.includes(section)
                          ? current.filter((item) => item !== section)
                          : [...current, section]
                      );
                      clear();
                    }}
                  />
                  Section {section}
                </label>
              ))}
            </section>
            <section className="detail-panel">
              <h2>Template repository (optional)</h2>
              <label>
                GitHub template repository
                <input
                  value={repository}
                  placeholder="Leave both template fields blank to omit"
                  onChange={(event) => {
                    setRepository(event.target.value);
                    clear();
                  }}
                />
              </label>
              <label>
                Template branch
                <input
                  value={branch}
                  placeholder="Use repository default branch"
                  onChange={(event) => {
                    setBranch(event.target.value);
                    clear();
                  }}
                />
              </label>
            </section>
            <section className="detail-panel">
              <h2>Grading</h2>
              <label className="assignment-setup__checkbox">
                <input
                  type="checkbox"
                  checked={gradingEnabled}
                  onChange={(event) => {
                    setGradingEnabled(event.target.checked);
                    clear();
                  }}
                />
                Enable grading
              </label>
              <label>
                Points
                <input
                  type="number"
                  value={points}
                  onChange={(event) => {
                    setPoints(event.target.value);
                    clear();
                  }}
                />
              </label>
              <label>
                Grading category
                <input
                  value={gradingCategory}
                  onChange={(event) => {
                    setGradingCategory(event.target.value);
                    clear();
                  }}
                />
              </label>
              <label>
                Faculty owner
                <input
                  value={facultyOwner}
                  onChange={(event) => {
                    setFacultyOwner(event.target.value);
                    clear();
                  }}
                />
              </label>
              <label>
                LMS assignment ID
                <input
                  value={lmsAssignmentId}
                  onChange={(event) => {
                    setLmsAssignmentId(event.target.value);
                    clear();
                  }}
                />
              </label>
            </section>
            <section className="detail-panel">
              <h2>Save assignment</h2>
              <button
                className="primary-action"
                type="button"
                disabled={loading}
                onClick={() => void previewSave()}
              >
                Save assignment changes
              </button>
            </section>
          </>
        )}
      </section>
      <ConfirmationWithPreviewModal
        confirmLabel="Save assignment changes"
        isOpen={isConfirming && preview !== null}
        onCancel={() => setIsConfirming(false)}
        onConfirm={save}
        preview={preview === null ? undefined : <pre>{preview.content}</pre>}
        summary={`${title.trim() || "This assignment"} will be updated.`}
        title="Save assignment changes?"
      />
    </main>
  );
};
