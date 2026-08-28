export const WORKFLOW_DISPATCH_TRIGGER = "workflow_dispatch";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasWorkflowDispatchString = (value: unknown): boolean =>
  typeof value === "string" && value === WORKFLOW_DISPATCH_TRIGGER;

const hasWorkflowDispatchArray = (value: unknown): boolean =>
  Array.isArray(value) && value.some((item) => hasWorkflowDispatchString(item));

const hasWorkflowDispatchObject = (value: unknown): boolean =>
  isRecord(value) && Object.hasOwn(value, WORKFLOW_DISPATCH_TRIGGER);

export const hasWorkflowDispatchTrigger = (workflowDocument: unknown): boolean => {
  if (!isRecord(workflowDocument)) {
    return false;
  }

  const triggers = workflowDocument.on;

  return (
    hasWorkflowDispatchString(triggers) ||
    hasWorkflowDispatchArray(triggers) ||
    hasWorkflowDispatchObject(triggers)
  );
};
