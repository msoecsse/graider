import type { ReactElement } from "react";

export interface KbdHintProps {
  readonly label: string;
}

export const KbdHint = ({ label }: KbdHintProps): ReactElement => (
  <kbd className="kbd-hint">{label}</kbd>
);
