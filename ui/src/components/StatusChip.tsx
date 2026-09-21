import type { ReactElement } from "react";

export type StatusChipVariant = "neutral" | "success" | "warning" | "error" | "info";

export interface StatusChipProps {
  readonly label: string;
  readonly variant?: StatusChipVariant;
}

const VARIANT_CLASS: Record<StatusChipVariant, string> = {
  neutral: "status-chip",
  success: "status-chip status-chip--success",
  warning: "status-chip status-chip--attention",
  error: "status-chip status-chip--error",
  info: "status-chip status-chip--info"
};

export const StatusChip = ({ label, variant = "neutral" }: StatusChipProps): ReactElement => (
  <span className={VARIANT_CLASS[variant]}>{label}</span>
);
