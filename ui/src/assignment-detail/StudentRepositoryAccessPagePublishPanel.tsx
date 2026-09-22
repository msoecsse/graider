import { useState, type ReactElement } from "react";
import type {
  StudentRepositoryAccessPagePublishActionResult,
  StudentRepositoryAccessPagePublishResult
} from "../../electron/ipc";
import { DetailItem } from "./AssignmentDetailPrimitives";
import { formatStatusLabel } from "../components/statusLabels";

export const StudentRepositoryAccessPagePublishPanel = ({
  result,
  copyFeedback,
  onCopy,
  onPublish,
  isPublishing,
  publishResult
}: {
  readonly result: StudentRepositoryAccessPagePublishResult;
  readonly copyFeedback: string | null;
  readonly onCopy: (value: string) => void;
  readonly onPublish: () => void;
  readonly isPublishing: boolean;
  readonly publishResult: StudentRepositoryAccessPagePublishActionResult | null;
}): ReactElement => {
  const [isReviewingPublish, setIsReviewingPublish] = useState(false);
  const canPublish = result.status === "uncommitted" || result.status === "unpushed";
  const commitMessage = `Publish student access page for ${result.assignmentSlug ?? "assignment"}`;
  return (
    <section
      className="detail-panel"
      aria-labelledby="student-repository-access-page-publish-title"
    >
      <h3 id="student-repository-access-page-publish-title">Publish readiness</h3>
      <dl className="detail-grid">
        <DetailItem label="Publish status" value={formatStatusLabel(result.status)} />
        <DetailItem
          label="Pages repository folder"
          value={result.checks.pagesRepositoryFolderSelected ? "Selected" : "Not selected"}
        />
        <DetailItem
          label="Local file"
          value={result.checks.fileExists ? "Exists" : "Not generated"}
        />
        <DetailItem
          label="Git repository"
          value={result.checks.isGitRepository ? "Detected" : "Not detected"}
        />
        <DetailItem label="Branch" value={result.checks.currentBranch} />
        <DetailItem label="Upstream" value={result.checks.upstreamBranch} />
        <DetailItem
          label="Uncommitted access page"
          value={result.checks.hasUncommittedAccessPage ? "Yes" : "No"}
        />
        <DetailItem label="Commits ahead" value={result.checks.aheadCount} />
        <DetailItem label="Commits behind" value={result.checks.behindCount} />
        <DetailItem
          label="Pages remote"
          value={
            result.checks.remoteMatchesConfiguredRepository === null
              ? "Unknown"
              : result.checks.remoteMatchesConfiguredRepository
                ? "Matches configured repository"
                : "May not match configured repository"
          }
        />
      </dl>
      {result.diagnostics.map((item) => (
        <p className="detail-panel__note" role="status" key={item.message}>
          {item.message}
        </p>
      ))}
      {canPublish && !isReviewingPublish ? (
        <button
          className="primary-action"
          type="button"
          onClick={() => setIsReviewingPublish(true)}
        >
          Publish Student Access Page
        </button>
      ) : null}
      {isReviewingPublish ? (
        <section className="detail-panel" aria-label="Publish Student Access Page review">
          <p>Review the local Git change before publishing.</p>
          <dl className="detail-grid">
            <DetailItem label="Pages repository folder" value={result.pagesRepositoryFolderPath} />
            <DetailItem label="Branch" value={result.checks.currentBranch} />
            <DetailItem label="Upstream" value={result.checks.upstreamBranch} />
            <DetailItem label="Generated page" value={result.outputPath} />
            <DetailItem label="Commit message" value={commitMessage} />
          </dl>
          <p className="detail-panel__note">
            GitHub Pages must already be enabled in GitHub. Graider does not check live GitHub Pages
            publication status.
          </p>
          <button
            className="primary-action"
            type="button"
            disabled={isPublishing}
            onClick={onPublish}
          >
            {isPublishing
              ? "Publishing Student Access Page..."
              : "Confirm Publish Student Access Page"}
          </button>
          <button
            className="secondary-action"
            type="button"
            disabled={isPublishing}
            onClick={() => setIsReviewingPublish(false)}
          >
            Cancel
          </button>
        </section>
      ) : null}
      {publishResult === null ? null : (
        <p
          className={publishResult.status === "failure" ? "error-message" : "success-message"}
          role="status"
        >
          {publishResult.diagnostics.map((item) => item.message).join(" ")}
        </p>
      )}
      {result.suggestedCommands.length === 0 ? null : (
        <>
          <p className="detail-panel__note">Suggested manual commands:</p>
          <pre>{result.suggestedCommands.join("\n")}</pre>
          <button
            className="secondary-action"
            type="button"
            onClick={() => onCopy(result.suggestedCommands.join("\n"))}
          >
            Copy commands
          </button>
          {copyFeedback === null ? null : <span role="status">{copyFeedback}</span>}
        </>
      )}
      <p className="detail-panel__note">
        Run suggested commands from the local Pages repository folder. GitHub Pages must be enabled
        and published for the Pages repository before students can use the link. Pages live status
        is unknown; Graider does not check or enable GitHub Pages.
      </p>
    </section>
  );
};
