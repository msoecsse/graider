import type { CommonCommandOptions } from "../core/command-context.js";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { Plan } from "../planning/plan-models.js";

const EMPTY_COUNT = 0;

export interface MutationGuardInput {
  plan?: Plan;
  preflightErrors?: readonly Diagnostic[];
  options: CommonCommandOptions;
}

export interface MutationGuardResult {
  allowed: boolean;
  errors: Diagnostic[];
}

const createMutationBlockedDiagnostic = (): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.MutationBlocked,
    "Apply is blocked because the computed plan contains blocked operations or errors."
  );

const createConfirmationRequiredDiagnostic = (): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.ConfirmationRequired,
    "Apply requires --yes in non-interactive execution before making GitHub mutations."
  );

export const evaluateMutationGuard = ({
  plan,
  preflightErrors = [],
  options
}: MutationGuardInput): MutationGuardResult => {
  const hasBlockedOperations =
    plan?.operations.some((operation) => operation.status === "blocked") ?? false;
  const errors = [...(plan?.errors ?? []), ...preflightErrors];

  if (hasBlockedOperations || errors.length > EMPTY_COUNT) {
    return {
      allowed: false,
      errors: [createMutationBlockedDiagnostic(), ...errors]
    };
  }

  if (!options.yes) {
    return {
      allowed: false,
      errors: [createConfirmationRequiredDiagnostic()]
    };
  }

  return {
    allowed: true,
    errors: []
  };
};
