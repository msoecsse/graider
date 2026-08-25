import { useMemo, useState, type ChangeEvent, type ReactElement } from "react";
import type { CourseSetupPreviewResult, CourseSetupRequest } from "../../electron/ipc";

type Step = "Course" | "Term" | "Sections and rosters" | "Preview" | "Save / finish";

const STEPS: readonly Step[] = [
  "Course",
  "Term",
  "Sections and rosters",
  "Preview",
  "Save / finish"
];

export const getStudentAccessPagesDefaults = (
  organization: string
): { readonly repository: string; readonly baseUrl: string } => {
  const normalized = organization.trim();
  return normalized === ""
    ? { repository: "", baseUrl: "" }
    : {
        repository: `${normalized}/${normalized}pages`,
        baseUrl: `https://${normalized}.github.io/${normalized}pages`
      };
};

const createRequest = (
  courseFolderPath: string,
  courseTitle: string,
  courseCode: string,
  githubOrganization: string,
  studentAccessPagesRepository: string,
  studentAccessPagesBaseUrl: string,
  studentAccessPagesBranch: string,
  termCode: string,
  sectionIds: readonly string[],
  rosterUploads: readonly { sectionId: string; content: string }[],
  confirmed = false,
  replaceExisting = false
): CourseSetupRequest => ({
  courseFolderPath,
  courseTitle,
  courseCode,
  githubOrganization,
  studentAccessPagesRepository,
  studentAccessPagesBaseUrl,
  studentAccessPagesBranch,
  termCode,
  sectionIds,
  rosterUploads,
  confirmed,
  replaceExisting
});

export const CourseSetupPage = ({
  courseFolderPath,
  onBack,
  onSaved
}: {
  readonly courseFolderPath: string;
  readonly onBack: () => void;
  readonly onSaved: () => void;
}): ReactElement => {
  const [activeStep, setActiveStep] = useState<Step>("Course");
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [githubOrganization, setGithubOrganization] = useState("");
  const [studentAccessPagesRepository, setStudentAccessPagesRepository] = useState("");
  const [studentAccessPagesBaseUrl, setStudentAccessPagesBaseUrl] = useState("");
  const [studentAccessPagesBranch, setStudentAccessPagesBranch] = useState("main");
  const [termCode, setTermCode] = useState("");
  const [sectionIds, setSectionIds] = useState<string[]>([""]);
  const [rosterUploads, setRosterUploads] = useState<
    readonly { sectionId: string; content: string }[]
  >([]);
  const [preview, setPreview] = useState<CourseSetupPreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const request = useMemo(
    () =>
      createRequest(
        courseFolderPath,
        courseTitle,
        courseCode,
        githubOrganization,
        studentAccessPagesRepository,
        studentAccessPagesBaseUrl,
        studentAccessPagesBranch,
        termCode,
        sectionIds,
        rosterUploads
      ),
    [
      courseFolderPath,
      courseTitle,
      courseCode,
      githubOrganization,
      studentAccessPagesRepository,
      studentAccessPagesBaseUrl,
      studentAccessPagesBranch,
      termCode,
      sectionIds,
      rosterUploads
    ]
  );

  const updateSection = (index: number, value: string): void => {
    setSectionIds((currentSections) =>
      currentSections.map((section, itemIndex) => (itemIndex === index ? value : section))
    );
    setPreview(null);
  };

  const handleRosterUpload = async (
    sectionId: string,
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    const content = await file.text();
    setRosterUploads((currentUploads) => [
      ...currentUploads.filter((upload) => upload.sectionId !== sectionId),
      { sectionId, content }
    ]);
    setPreview(null);
  };

  const handlePreview = async (): Promise<void> => {
    const previewCourseSetup = window.graiderUI.previewCourseSetup;
    if (previewCourseSetup === undefined) {
      setSaveMessage("Course setup is unavailable in this app build.");
      return;
    }
    setIsLoading(true);
    setSaveMessage(null);
    try {
      setPreview(await previewCourseSetup(request));
      setActiveStep("Preview");
    } catch {
      setSaveMessage("Unable to prepare the course setup preview.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    const saveCourseSetup = window.graiderUI.saveCourseSetup;
    if (saveCourseSetup === undefined || preview === null) return;
    setIsLoading(true);
    try {
      const result = await saveCourseSetup({ ...request, confirmed: true, replaceExisting });
      if (result.status === "success") {
        setSaveMessage(
          `Created ${result.writtenFiles.length} configuration file${result.writtenFiles.length === 1 ? "" : "s"}.`
        );
        setActiveStep("Save / finish");
      } else {
        setSaveMessage(result.diagnostics.map((diagnostic) => diagnostic.message).join(" "));
      }
    } catch {
      setSaveMessage("Unable to save course setup files.");
    } finally {
      setIsLoading(false);
    }
  };

  const canSave = preview?.status === "ready" && (!preview.hasConflicts || replaceExisting);

  return (
    <main className="dashboard-shell" aria-labelledby="course-setup-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="course-setup-title">Course Setup</h1>
            <p className="assignment-detail__subtitle">{courseFolderPath}</p>
          </div>
          <button className="secondary-action" type="button" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
      </header>
      <section className="dashboard-content course-setup" aria-label="Course setup wizard">
        <nav className="course-setup__steps" aria-label="Course setup steps">
          {STEPS.map((step) => (
            <button
              className={
                activeStep === step
                  ? "course-setup__step course-setup__step--active"
                  : "course-setup__step"
              }
              type="button"
              key={step}
              onClick={() => setActiveStep(step)}
            >
              {step}
            </button>
          ))}
        </nav>
        <div className="course-setup__content">
          <section className="detail-panel" hidden={activeStep !== "Course"}>
            <h2>Course</h2>
            <label>
              Course name
              <input
                value={courseTitle}
                onChange={(event) => {
                  setCourseTitle(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Course code
              <input
                value={courseCode}
                onChange={(event) => {
                  setCourseCode(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              GitHub organization
              <input
                value={githubOrganization}
                onChange={(event) => {
                  const previousDefaults = getStudentAccessPagesDefaults(githubOrganization);
                  const nextOrganization = event.target.value;
                  const nextDefaults = getStudentAccessPagesDefaults(nextOrganization);
                  setGithubOrganization(nextOrganization);
                  if (
                    studentAccessPagesRepository === "" ||
                    studentAccessPagesRepository === previousDefaults.repository
                  )
                    setStudentAccessPagesRepository(nextDefaults.repository);
                  if (
                    studentAccessPagesBaseUrl === "" ||
                    studentAccessPagesBaseUrl === previousDefaults.baseUrl
                  )
                    setStudentAccessPagesBaseUrl(nextDefaults.baseUrl);
                  setPreview(null);
                }}
              />
            </label>
            <h3>Student access pages / GitHub Pages (optional)</h3>
            <label>
              Pages repository
              <input
                value={studentAccessPagesRepository}
                placeholder="csc1120/csc1120pages"
                onChange={(event) => {
                  setStudentAccessPagesRepository(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Pages base URL
              <input
                value={studentAccessPagesBaseUrl}
                placeholder="https://csc1120.github.io/csc1120pages"
                onChange={(event) => {
                  setStudentAccessPagesBaseUrl(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Pages branch
              <input
                value={studentAccessPagesBranch}
                placeholder="main"
                onChange={(event) => {
                  setStudentAccessPagesBranch(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
          </section>
          <section className="detail-panel" hidden={activeStep !== "Term"}>
            <h2>Term</h2>
            <label>
              Term code
              <input
                value={termCode}
                placeholder="27s1"
                onChange={(event) => {
                  setTermCode(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
          </section>
          <section className="detail-panel" hidden={activeStep !== "Sections and rosters"}>
            <h2>Sections and rosters</h2>
            {sectionIds.map((sectionId, index) => (
              <div className="course-setup__section" key={index}>
                <label>
                  Section ID
                  <input
                    value={sectionId}
                    onChange={(event) => updateSection(index, event.target.value)}
                  />
                </label>
                <label>
                  Roster CSV (optional)
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      void handleRosterUpload(sectionId.trim(), event);
                    }}
                  />
                </label>
              </div>
            ))}
            <button
              className="secondary-action"
              type="button"
              onClick={() => setSectionIds((currentSections) => [...currentSections, ""])}
            >
              Add section
            </button>
          </section>
          <section className="detail-panel" hidden={activeStep !== "Preview"}>
            <h2>Preview</h2>
            {preview === null ? (
              <p className="detail-panel__note">
                Generate a preview to validate files before saving.
              </p>
            ) : (
              <>
                {preview.diagnostics.map((diagnostic) => (
                  <p className="error-message" key={diagnostic.message}>
                    {diagnostic.message}
                  </p>
                ))}
                {preview.files.map((file) => (
                  <details key={file.path}>
                    <summary>
                      {file.exists ? "Replace required: " : "Create: "}
                      {file.path}
                    </summary>
                    <pre>{file.content}</pre>
                  </details>
                ))}
              </>
            )}
            <button
              className="primary-action"
              type="button"
              disabled={isLoading}
              onClick={() => {
                void handlePreview();
              }}
            >
              {isLoading ? "Preparing preview..." : "Generate preview"}
            </button>
          </section>
          <section className="detail-panel" hidden={activeStep !== "Save / finish"}>
            <h2>Save / finish</h2>
            {preview?.hasConflicts ? (
              <label>
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(event) => setReplaceExisting(event.target.checked)}
                />{" "}
                Replace the existing previewed files
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
              {isLoading ? "Saving..." : "Save course setup"}
            </button>
            {saveMessage === null ? null : <p role="status">{saveMessage}</p>}
            {saveMessage?.startsWith("Created") === true ? (
              <button className="secondary-action" type="button" onClick={onSaved}>
                Open dashboard
              </button>
            ) : null}
          </section>
          <div className="course-setup__commands">
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                void handlePreview();
              }}
            >
              Preview setup
            </button>
          </div>
          {saveMessage === null || saveMessage.startsWith("Created") ? null : (
            <p className="error-message" role="alert">
              {saveMessage}
            </p>
          )}
        </div>
      </section>
    </main>
  );
};
