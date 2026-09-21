import type { ReactElement, ReactNode } from "react";

export interface EmptyStateAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description: ReactNode;
  readonly action?: EmptyStateAction;
}

export const EmptyState = ({ title, description, action }: EmptyStateProps): ReactElement => (
  <div className="empty-state">
    <div className="empty-state__marker" aria-hidden="true" />
    <h2>{title}</h2>
    <p>{description}</p>
    {action === undefined ? null : (
      <p className="empty-state__note">
        <button
          className="primary-action"
          type="button"
          disabled={action.disabled === true}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      </p>
    )}
  </div>
);
