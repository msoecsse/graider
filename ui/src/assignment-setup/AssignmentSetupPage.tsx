import { useEffect, useMemo, useState, type ReactElement } from "react";
import type {
  AssignmentSetupPreviewResult,
  AssignmentSetupRequest,
  AssignmentSetupTerm,
  CourseFolderRecord
} from "../../electron/ipc";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";

const toIsoWithOffset = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const minutes = String(absoluteOffset % 60).padStart(2, "0");
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
  return `${local}${sign}${hours}:${minutes}`;
};

const createRequest = (
  courseFolder: CourseFolderRecord,
  values: {
    assignmentTitle: string;
    assignmentSlug: string;
    termCode: string;
    sectionIds: readonly string[];
    templateRepository: string;
    templateBranch: string;
    dueAt: string;
    gradingEnabled: boolean;
    points: number;
    gradingCategory: string;
  }
): AssignmentSetupRequest => ({
  courseFolderId: courseFolder.id,
  courseFolderPath: courseFolder.path,
  ...values,
  confirmed: false,
  replaceExisting: false
});

export const AssignmentSetupPage = ({
  courseFolder,
  onBack,
  onOpenAssignment
}: {
  readonly courseFolder: CourseFolderRecord;
  readonly onBack: () => void;
  readonly onOpenAssignment: (selection: AssignmentDetailSelection) => void;
}): ReactElement => {
  const [terms, setTerms] = useState<readonly AssignmentSetupTerm[]>([]);
  const [termMessage, setTermMessage] = useState<string | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentSlug, setAssignmentSlug] = useState("");
  const [termCode, setTermCode] = useState("");
  const [sectionIds, setSectionIds] = useState<readonly string[]>([]);
  const [templateRepository, setTemplateRepository] = useState("");
  const [templateBranch, setTemplateBranch] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [gradingEnabled, setGradingEnabled] = useState(true);
  const [points, setPoints] = useState("100");
  const [gradingCategory, setGradingCategory] = useState("labs");
  const [preview, setPreview] = useState<AssignmentSetupPreviewResult | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadTerms = window.graiderUI.loadAssignmentSetupTerms;
    if (loadTerms === undefined) {
      setTermMessage("Assignment setup is unavailable in this app build.");
      return;
    }
    void loadTerms({ courseFolderId: courseFolder.id, courseFolderPath: courseFolder.path })
      .then((result) => {
        setTerms(result.terms);
        setTermMessage(result.diagnostics.map((item) => item.message).join(" ") || null);
      })
      .catch(() => setTermMessage("Unable to load terms for this course."));
  }, [courseFolder.id, courseFolder.path]);

  const selectedTerm = terms.find((term) => term.code === termCode) ?? null;
  const request = useMemo(
    () =>
      createRequest(courseFolder, {
        assignmentTitle,
        assignmentSlug,
        termCode,
        sectionIds,
        templateRepository,
        templateBranch,
        dueAt: toIsoWithOffset(dueAt),
        gradingEnabled,
        points: Number(points),
        gradingCategory
      }),
    [
      assignmentSlug,
      assignmentTitle,
      courseFolder,
      dueAt,
      gradingCategory,
      gradingEnabled,
      points,
      sectionIds,
      templateBranch,
      templateRepository,
      termCode
    ]
  );

  const clearPreview = (): void => {
    setPreview(null);
    setReplaceExisting(false);
  };

  const handleTermChange = (nextTermCode: string): void => {
    setTermCode(nextTermCode);
    setSectionIds(terms.find((term) => term.code === nextTermCode)?.sections ?? []);
    clearPreview();
  };

  const toggleSection = (sectionId: string): void => {
    setSectionIds((current) =>
      current.includes(sectionId)
        ? current.filter((candidate) => candidate !== sectionId)
        : [...current, sectionId]
    );
    clearPreview();
  };

  const handlePreview = async (): Promise<void> => {
    const previewAssignmentSetup = window.graiderUI.previewAssignmentSetup;
    if (previewAssignmentSetup === undefined) {
      setMessage("Assignment setup is unavailable in this app build.");
      return;
    }
    setIsLoading(true);
    setMessage(null);
    try {
      setPreview(await previewAssignmentSetup(request));
    } catch {
      setMessage("Unable to prepare the assignment setup preview.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    const saveAssignmentSetup = window.graiderUI.saveAssignmentSetup;
    if (saveAssignmentSetup === undefined || preview === null) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const result = await saveAssignmentSetup({ ...request, confirmed: true, replaceExisting });
      if (result.status === "success") {
        const assignmentFile = result.writtenFiles[0];
        if (assignmentFile === undefined) {
          setMessage("Assignment configuration was saved without a file path.");
          return;
        }
        onOpenAssignment({
          courseFolderId: courseFolder.id,
          courseFolderPath: courseFolder.path,
          assignmentFile,
          assignmentTitle: assignmentTitle.trim() || null,
          assignmentSlug: assignmentSlug.trim() || null,
          assignmentStatus: "active",
          courseTitle: null,
          courseSlug: null,
          termTitle: null,
          termSlug: termCode.trim() || null
        });
      } else {
        setMessage(result.diagnostics.map((item) => item.message).join(" "));
      }
    } catch {
      setMessage("Unable to save assignment.yml.");
    } finally {
      setIsLoading(false);
    }
  };

  const canSave = preview?.status === "ready" && (!preview.hasConflicts || replaceExisting);
  const previewFeedbackClassName =
    preview?.status === "ready" ? "success-message" : "error-message";
  const previewFeedbackRole = preview?.status === "ready" ? "status" : "alert";

  return (
    <main className="dashboard-shell" aria-labelledby="assignment-setup-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="assignment-setup-title">Assignment Setup</h1>
            <p className="assignment-detail__subtitle">{courseFolder.path}</p>
          </div>
          <button className="secondary-action" type="button" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
      </header>
      <section className="dashboard-content assignment-setup" aria-label="Assignment setup wizard">
        {termMessage === null ? null : (
          <p className="error-message" role="alert">
            {termMessage}
          </p>
        )}
        <section className="detail-panel">
          <h2>Assignment basics</h2>
          <label>
            Assignment title
            <input
              value={assignmentTitle}
              onChange={(event) => {
                setAssignmentTitle(event.target.value);
                clearPreview();
              }}
            />
          </label>
          <label>
            Assignment slug
            <input
              value={assignmentSlug}
              onChange={(event) => {
                setAssignmentSlug(event.target.value);
                clearPreview();
              }}
            />
          </label>
          <label>
            Due date and time
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => {
                setDueAt(event.target.value);
                clearPreview();
              }}
            />
          </label>
        </section>
        <section className="detail-panel">
          <h2>Sections</h2>
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
          {selectedTerm === null ? (
            <p className="detail-panel__note">Choose a term to select its sections.</p>
          ) : selectedTerm.sections.length === 0 ? (
            <p className="error-message" role="alert">
              This term has no sections. Add a section before creating an assignment.
            </p>
          ) : (
            <div className="assignment-setup__sections">
              {selectedTerm.sections.map((sectionId) => (
                <label key={sectionId}>
                  <input
                    type="checkbox"
                    checked={sectionIds.includes(sectionId)}
                    onChange={() => toggleSection(sectionId)}
                  />
                  Section {sectionId}
                </label>
              ))}
            </div>
          )}
        </section>
        <section className="detail-panel">
          <h2>Template repository</h2>
          <label>
            GitHub template repository
            <input
              value={templateRepository}
              placeholder="owner/repository"
              onChange={(event) => {
                setTemplateRepository(event.target.value);
                clearPreview();
              }}
            />
          </label>
          <label>
            Template branch
            <input
              value={templateBranch}
              placeholder="Use repository default branch"
              onChange={(event) => {
                setTemplateBranch(event.target.value);
                clearPreview();
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
                clearPreview();
              }}
            />
            Enable grading
          </label>
          <label>
            Points
            <input
              type="number"
              min="1"
              value={points}
              onChange={(event) => {
                setPoints(event.target.value);
                clearPreview();
              }}
            />
          </label>
          <label>
            Grading category
            <input
              value={gradingCategory}
              onChange={(event) => {
                setGradingCategory(event.target.value);
                clearPreview();
              }}
            />
          </label>
        </section>
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
            {isLoading ? "Preparing preview..." : "Preview assignment.yml"}
          </button>
          {preview === null ? null : (
            <>
              {preview.diagnostics.map((item) => (
                <p
                  className={previewFeedbackClassName}
                  role={previewFeedbackRole}
                  key={item.message}
                >
                  {item.message}
                </p>
              ))}
              {preview.files.map((file) => (
                <details open key={file.path}>
                  <summary>
                    {file.exists ? "Replace required: " : "Create: "}
                    {file.path}
                  </summary>
                  <pre>{file.content}</pre>
                </details>
              ))}
              {preview.hasConflicts ? (
                <label className="assignment-setup__checkbox">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(event) => setReplaceExisting(event.target.checked)}
                  />{" "}
                  Replace the existing assignment.yml
                </label>
              ) : null}
              <button
                className="primary-action"
                type="button"
                disabled={!canSave || isLoading}
                onClick={() => {
                  void handleSave();
                }}
              >
                {isLoading ? "Saving..." : "Save assignment setup"}
              </button>
            </>
          )}
          {message === null ? null : (
            <p className="error-message" role="alert">
              {message}
            </p>
          )}
        </section>
      </section>
    </main>
  );
};
