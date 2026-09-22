import type { ReactElement } from "react";
import { KbdHint } from "../components/KbdHint";

export const GradingFooterHintBar = (): ReactElement => (
  <footer className="grading-workspace__footer">
    <ul className="grading-workspace__footer-hints" aria-label="Keyboard shortcut hints">
      <li className="grading-workspace__footer-hint">
        <KbdHint label="J" /> Next in filter
      </li>
      <li className="grading-workspace__footer-hint">
        <KbdHint label="K" /> Previous
      </li>
      <li className="grading-workspace__footer-hint">
        <KbdHint label="C" /> Comment
      </li>
      <li className="grading-workspace__footer-hint">
        <KbdHint label="A" /> Checks
      </li>
      <li className="grading-workspace__footer-hint">
        <KbdHint label="⏎" /> Complete
      </li>
      <li className="grading-workspace__footer-hint">
        <KbdHint label="?" /> All shortcuts
      </li>
    </ul>
    <p className="grading-workspace__footer-status">Saved automatically</p>
  </footer>
);
