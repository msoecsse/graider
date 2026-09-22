import type { ReactElement } from "react";
import { KbdHint } from "../components/KbdHint";

export const GradingKeyboardCheatSheetModal = ({
  open,
  onClose
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement | null => {
  if (!open) return null;
  return (
    <div className="confirmation-modal__backdrop">
      <div
        className="confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grading-shortcuts-heading"
      >
        <h2 id="grading-shortcuts-heading">Keyboard shortcuts</h2>
        <div className="grading-shortcut-groups">
          <div className="grading-shortcut-group">
            <h3>Move</h3>
            <div>
              <KbdHint label="J" /> <span>Next student in the active filter</span>
            </div>
            <div>
              <KbdHint label="K" /> <span>Previous student in the active filter</span>
            </div>
            <div>
              <KbdHint label="⇧J" /> <span>Next student in the full roster</span>
            </div>
            <div>
              <KbdHint label="/" /> <span>Focus the student filter</span>
            </div>
          </div>
          <div className="grading-shortcut-group">
            <h3>Read</h3>
            <div>
              <KbdHint label="A" /> <span>Open automated checks, or return focus</span>
            </div>
            <div>
              <KbdHint label="R" /> <span>Reload automated checks (panel focused)</span>
            </div>
            <div>
              <KbdHint label="N" /> <KbdHint label="⇧N" />{" "}
              <span>Next / previous JUnit failure (panel focused)</span>
            </div>
            <div>
              <KbdHint label="H" /> <span>Open commit history</span>
            </div>
          </div>
          <div className="grading-shortcut-group">
            <h3>Grade</h3>
            <div>
              <KbdHint label="C" /> <span>Add a comment on the selected source</span>
            </div>
            <div>
              <KbdHint label="M" /> <span>Add a manual adjustment</span>
            </div>
            <div>
              <KbdHint label="1–9" /> <span>Apply that library comment</span>
            </div>
          </div>
          <div className="grading-shortcut-group">
            <h3>Finish</h3>
            <div>
              <KbdHint label="⏎" /> <span>Mark complete and go to next ungraded</span>
            </div>
            <div>
              <KbdHint label="P" /> <span>Open publish review</span>
            </div>
            <div>
              <KbdHint label="Esc" /> <span>Close an open panel or dialog</span>
            </div>
            <div>
              <KbdHint label="?" /> <span>Open this cheat sheet</span>
            </div>
          </div>
        </div>
        <p>Shortcuts are disabled while typing in a text field.</p>
        <div className="grading-apply-comment__actions">
          <button className="secondary-action" type="button" onClick={onClose}>
            Close keyboard shortcuts
          </button>
        </div>
      </div>
    </div>
  );
};
