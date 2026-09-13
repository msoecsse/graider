/** The sole workflow file Graider may manage in future deployment slices. */
export const GRAIDER_MANAGED_WORKFLOW_PATH = ".github/workflows/grade.yml";

/** Stable, human-readable ownership marker for generated grading workflows. */
export const GRAIDER_MANAGED_WORKFLOW_MARKER = "# Managed by Graider";
export const GRAIDER_MANAGED_WORKFLOW_VERSION = 1;
const GRAIDER_MANAGED_WORKFLOW_VERSION_PREFIX = "# graider-workflow-version: ";

export type ManagedWorkflowClassification =
  | { readonly classification: "absent" }
  | { readonly classification: "identical" }
  | { readonly classification: "managed_outdated"; readonly ownershipVersion: number }
  | { readonly classification: "unmanaged_conflict" }
  | { readonly classification: "managed_version_unsupported"; readonly ownershipVersion: number };

export type ManagedWorkflowDeploymentAction =
  | "create"
  | "noop"
  | "update_managed"
  | "conflict_unmanaged"
  | "conflict_unsupported_version";

export type ManagedWorkflowDeploymentPlan = ManagedWorkflowClassification & {
  readonly action: ManagedWorkflowDeploymentAction;
};

const normalizeTransportLineEndings = (content: string): string => content.replaceAll("\r\n", "\n");

const getManagedWorkflowVersion = (content: string): number | undefined => {
  const lines = normalizeTransportLineEndings(content).split("\n");
  const versionLine = lines[1];

  if (
    lines[0] !== GRAIDER_MANAGED_WORKFLOW_MARKER ||
    lines.filter((line) => line === GRAIDER_MANAGED_WORKFLOW_MARKER).length !== 1 ||
    versionLine === undefined ||
    !versionLine.startsWith(GRAIDER_MANAGED_WORKFLOW_VERSION_PREFIX)
  ) {
    return undefined;
  }

  const rawVersion = versionLine.slice(GRAIDER_MANAGED_WORKFLOW_VERSION_PREFIX.length);
  return /^\d+$/u.test(rawVersion) ? Number(rawVersion) : undefined;
};

export const renderManagedWorkflowMarker = (): readonly [string, string] => [
  GRAIDER_MANAGED_WORKFLOW_MARKER,
  `${GRAIDER_MANAGED_WORKFLOW_VERSION_PREFIX}${String(GRAIDER_MANAGED_WORKFLOW_VERSION)}`
];

/**
 * Classifies only the exact Graider ownership marker. It intentionally does
 * not infer ownership from workflow names, actions, or other YAML content.
 */
export const classifyManagedWorkflow = (
  existingContent: string | null | undefined,
  canonicalContent: string
): ManagedWorkflowClassification => {
  if (existingContent === null || existingContent === undefined)
    return { classification: "absent" };

  if (
    normalizeTransportLineEndings(existingContent) ===
    normalizeTransportLineEndings(canonicalContent)
  ) {
    return { classification: "identical" };
  }

  const ownershipVersion = getManagedWorkflowVersion(existingContent);
  if (ownershipVersion === undefined) return { classification: "unmanaged_conflict" };

  return ownershipVersion === GRAIDER_MANAGED_WORKFLOW_VERSION
    ? { classification: "managed_outdated", ownershipVersion }
    : { classification: "managed_version_unsupported", ownershipVersion };
};

/** Pure future-deployment policy; this performs no GitHub I/O. */
export const planManagedWorkflowDeployment = (
  existingContent: string | null | undefined,
  canonicalContent: string
): ManagedWorkflowDeploymentPlan => {
  const classification = classifyManagedWorkflow(existingContent, canonicalContent);

  switch (classification.classification) {
    case "absent":
      return { ...classification, action: "create" };
    case "identical":
      return { ...classification, action: "noop" };
    case "managed_outdated":
      return { ...classification, action: "update_managed" };
    case "managed_version_unsupported":
      return { ...classification, action: "conflict_unsupported_version" };
    case "unmanaged_conflict":
      return { ...classification, action: "conflict_unmanaged" };
  }
};
