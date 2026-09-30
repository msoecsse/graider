import type { ReactElement, ReactNode } from "react";
import { KbdHint } from "./KbdHint";

export interface PageHeaderAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly kbd?: string;
  readonly disabled?: boolean;
}

export interface PageHeaderProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly titleId?: string;
  readonly meta?: ReactNode;
  readonly primaryAction?: PageHeaderAction;
  readonly secondaryActions?: readonly PageHeaderAction[];
  readonly overflow?: ReactNode;
}

const MAX_SECONDARY_ACTIONS = 2;

export const PageHeader = ({
  eyebrow,
  title,
  titleId,
  meta,
  primaryAction,
  secondaryActions = [],
  overflow
}: PageHeaderProps): ReactElement => (
  <header className="page-header">
    <div className="page-header__titles">
      {eyebrow === undefined ? null : <p className="page-header__eyebrow">{eyebrow}</p>}
      <h1 className="page-header__title" id={titleId}>
        {title}
      </h1>
      {meta === undefined ? null : <p className="page-header__meta">{meta}</p>}
    </div>
    <div className="page-header__actions">
      {secondaryActions.slice(0, MAX_SECONDARY_ACTIONS).map((action) => (
        <button
          className="secondary-action"
          disabled={action.disabled === true}
          key={action.label}
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      ))}
      {primaryAction === undefined ? null : (
        <button
          className="primary-action"
          disabled={primaryAction.disabled === true}
          onClick={primaryAction.onClick}
          type="button"
        >
          {primaryAction.label}
          {primaryAction.kbd === undefined ? null : (
            <>
              {" "}
              <KbdHint label={primaryAction.kbd} />
            </>
          )}
        </button>
      )}
      {overflow === undefined ? null : overflow}
    </div>
  </header>
);
