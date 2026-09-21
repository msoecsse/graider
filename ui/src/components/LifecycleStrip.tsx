import type { ReactElement } from "react";

export type LifecycleStepState = "complete" | "current" | "upcoming" | "blocked";

export interface LifecycleStep {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly state: LifecycleStepState;
}

export interface LifecycleStripProps {
  readonly steps: readonly LifecycleStep[];
}

const MARKER_TEXT: Record<LifecycleStepState, string> = {
  complete: "✓",
  current: "",
  upcoming: "",
  blocked: "!"
};

export const LifecycleStrip = ({ steps }: LifecycleStripProps): ReactElement => (
  <ol className="lifecycle-strip">
    {steps.map((step, index) => (
      <li className={`lifecycle-strip__step lifecycle-strip__step--${step.state}`} key={step.id}>
        {index === 0 ? null : <span className="lifecycle-strip__chevron" aria-hidden="true" />}
        <span className="lifecycle-strip__marker" aria-hidden="true">
          {MARKER_TEXT[step.state]}
        </span>
        <span className="lifecycle-strip__label">{step.label}</span>
        {step.detail === undefined ? null : (
          <span className="lifecycle-strip__detail">{step.detail}</span>
        )}
      </li>
    ))}
  </ol>
);
