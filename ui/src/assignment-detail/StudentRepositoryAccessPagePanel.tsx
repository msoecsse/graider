import { useState, type ReactElement } from "react";
import type { StudentRepositoryAccessPageResult } from "../../electron/ipc";
import { DetailItem } from "./AssignmentDetailPrimitives";
import { formatStatusLabel } from "../components/statusLabels";

export interface StudentAccessPagesConfigSaveOutcome {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

const derivePagesBaseUrl = (repository: string): string => {
  const [owner, name] = repository.trim().split("/");
  return owner === undefined || name === undefined || owner === "" || name === ""
    ? ""
    : `https://${owner}.github.io/${name}`;
};

const getConfiguredPagesBaseUrl = (
  result: StudentRepositoryAccessPageResult,
  defaultRepository: string
): string => {
  const suffix = `/${result.outputPath}`;
  return result.pagesUrl !== null && result.pagesUrl.endsWith(suffix)
    ? result.pagesUrl.slice(0, -suffix.length)
    : derivePagesBaseUrl(result.pagesRepository ?? defaultRepository);
};

export const StudentRepositoryAccessPagePanel = ({
  result,
  isGenerating,
  isSelectingPagesFolder,
  copyFeedback,
  onGenerate,
  onSelectPagesFolder,
  onSaveConfig,
  isSavingConfig,
  configFeedback,
  defaultRepository,
  onCopy
}: {
  readonly result: StudentRepositoryAccessPageResult;
  readonly isGenerating: boolean;
  readonly isSelectingPagesFolder: boolean;
  readonly copyFeedback: string | null;
  readonly onGenerate: () => void;
  readonly onSelectPagesFolder: () => Promise<string | null>;
  readonly onSaveConfig: (
    repository: string,
    baseUrl: string,
    branch: string
  ) => Promise<StudentAccessPagesConfigSaveOutcome>;
  readonly isSavingConfig: boolean;
  readonly configFeedback: string | null;
  readonly defaultRepository: string;
  readonly onCopy: (value: string) => void;
}): ReactElement => {
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [repository, setRepository] = useState(result.pagesRepository ?? defaultRepository);
  const [baseUrl, setBaseUrl] = useState(
    result.pagesBaseUrl ?? getConfiguredPagesBaseUrl(result, defaultRepository)
  );
  const [branch, setBranch] = useState(result.pagesBranch ?? "main");
  const [selectedPagesFolderPath, setSelectedPagesFolderPath] = useState<string | null>(null);
  const [formDiagnostic, setFormDiagnostic] = useState<string | null>(null);
  const invalid =
    !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(repository) ||
    !baseUrl.startsWith("https://") ||
    branch.trim() === "";
  const updateRepository = (next: string): void => {
    const previousAutoUrl = derivePagesBaseUrl(repository);
    setRepository(next);
    if (baseUrl === "" || baseUrl === previousAutoUrl) setBaseUrl(derivePagesBaseUrl(next));
  };
  const save = async (): Promise<void> => {
    if (invalid) {
      setFormDiagnostic("Enter an owner/repository, HTTPS base URL, and branch before saving.");
      return;
    }
    setFormDiagnostic(null);
    const outcome = await onSaveConfig(repository.trim(), baseUrl.trim(), branch.trim());
    if (outcome.ok) {
      setIsConfiguring(false);
    } else {
      setFormDiagnostic(
        outcome.diagnostics.join(" ") || "Unable to save Student Access Pages settings."
      );
    }
  };
  const selectPagesFolder = async (): Promise<void> => {
    const folderPath = await onSelectPagesFolder();
    if (folderPath !== null) setSelectedPagesFolderPath(folderPath);
  };
  return (
    <section className="detail-panel" aria-labelledby="student-repository-access-page-title">
      <h2 id="student-repository-access-page-title" tabIndex={-1}>
        Student repository access page
      </h2>
      <p className="detail-panel__note">
        Apply generates this HTML page in the configured Pages repository. Regenerate it here after
        roster or repository-link corrections. Course repository files remain the source for
        assignment, roster, and manifest data.
      </p>
      <dl className="detail-grid">
        <DetailItem label="Status" value={formatStatusLabel(result.status)} />
        <DetailItem label="Pages repository" value={result.pagesRepository ?? "Not configured"} />
        <DetailItem label="Generated page path" value={result.outputPath || "Unavailable"} />
        <DetailItem label="Generated" value={result.generatedAt ?? "Not generated yet"} />
        <DetailItem label="Active students" value={String(result.summary.activeStudents)} />
        <DetailItem label="Included" value={String(result.summary.includedStudents)} />
        <DetailItem label="Skipped inactive" value={String(result.summary.skippedInactive)} />
        <DetailItem label="Missing repositories" value={String(result.summary.missingRepository)} />
      </dl>
      {result.pagesRepository === null ? (
        <>
          <p role="status">
            A Pages repository must be configured before Graider can generate a public student
            access page.
          </p>
          <button className="secondary-action" type="button" onClick={() => setIsConfiguring(true)}>
            Configure Student Access Pages
          </button>
        </>
      ) : !result.pagesRepositoryFolderSelected ? (
        <>
          <p role="status">Pages repository folder is not selected.</p>
          <button
            className="secondary-action"
            type="button"
            disabled={isSelectingPagesFolder}
            onClick={onSelectPagesFolder}
          >
            {isSelectingPagesFolder
              ? "Selecting Pages repository folder..."
              : "Select Pages repository folder"}
          </button>
        </>
      ) : result.pagesUrl === null ? (
        <p role="status">
          Graider cannot determine the GitHub Pages URL. The access page can be generated locally,
          but a Canvas link is unavailable until a valid HTTPS Pages URL is configured.
        </p>
      ) : (
        <div className="detail-copy-row">
          <a href={result.pagesUrl} target="_blank" rel="noreferrer">
            {result.pagesUrl}
          </a>
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              if (result.pagesUrl !== null) onCopy(result.pagesUrl);
            }}
          >
            Copy Canvas link
          </button>
          {copyFeedback === null ? null : <span role="status">{copyFeedback}</span>}
        </div>
      )}
      {result.pagesRepository !== null ? (
        <button className="secondary-action" type="button" onClick={() => setIsConfiguring(true)}>
          Edit Student Access Pages Settings
        </button>
      ) : null}
      {isConfiguring ? (
        <section
          className="detail-panel student-access-pages-settings"
          aria-label="Student Access Pages settings"
        >
          <p>
            Student Access Pages need a public GitHub Pages repository, a published base URL, and a
            local clone where Graider can generate the page.
          </p>
          <div className="student-access-pages-settings__fields">
            <label>
              Pages repository
              <input
                value={repository}
                onChange={(event) => updateRepository(event.target.value)}
              />
            </label>
            <label>
              Base URL
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </label>
            <label>
              Branch
              <input value={branch} onChange={(event) => setBranch(event.target.value)} />
            </label>
          </div>
          <div className="student-access-pages-settings__folder">
            <strong>Local Pages repository folder</strong>
            <span>
              {selectedPagesFolderPath ??
                (result.pagesRepositoryFolderSelected ? "Selected" : "Not selected")}
            </span>
            <button
              className="secondary-action"
              type="button"
              disabled={isSelectingPagesFolder}
              onClick={() => void selectPagesFolder()}
            >
              {isSelectingPagesFolder
                ? "Selecting Pages repository folder..."
                : "Select Pages repository folder"}
            </button>
          </div>
          {formDiagnostic === null ? null : (
            <p className="error-message" role="alert">
              {formDiagnostic}
            </p>
          )}
          <button
            className="primary-action"
            type="button"
            disabled={isSavingConfig}
            onClick={() => void save()}
          >
            {isSavingConfig
              ? "Saving Student Access Pages Settings..."
              : "Save Student Access Pages Settings"}
          </button>
        </section>
      ) : null}
      {configFeedback === null ? null : (
        <p className="success-message" role="status">
          {configFeedback}
        </p>
      )}
      <p className="detail-panel__note">
        Pages repository: {result.pagesRepository ?? "Not configured"}. This requires GitHub Pages
        to be enabled for the Pages repository; Graider does not enable it or publish this file.
      </p>
      {result.summary.missingRepository > 0 ? (
        <p role="status">
          {String(result.summary.missingRepository)} active student(s) are missing repository links
          and will be excluded.
        </p>
      ) : null}
      {result.diagnostics.length > 0 ? (
        <ul className="detail-diagnostics">
          {result.diagnostics.map((item) => (
            <li key={item.message}>{item.message}</li>
          ))}
        </ul>
      ) : null}
      <button
        className="primary-action"
        type="button"
        disabled={isGenerating || !result.pagesRepositoryFolderSelected}
        onClick={onGenerate}
      >
        {isGenerating
          ? "Generating student access page..."
          : result.exists
            ? "Regenerate student access page"
            : "Generate student access page"}
      </button>
    </section>
  );
};
