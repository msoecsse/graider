import fs from "node:fs";
import path from "node:path";
import type { LoadedGraiderConfig, RawCourseConfig } from "../config/config-models.js";
import {
  GRADING_WORKFLOW_MISSING_CODE,
  WORKFLOW_DISPATCH_UNSUPPORTED_CODE,
  createConfigDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { parseYaml } from "../io/stable-yaml.js";
import { createGeneratedWorkflowPath } from "./workflow-paths.js";

const WORKFLOW_DISPATCH_TRIGGER = "workflow_dispatch";
const PRESET_GRADING_MODE = "preset";

type GradingConfig = RawCourseConfig["grading"];

interface WorkflowCandidate {
  readonly absolutePath: string;
  readonly relativePath: string;
}

export interface WorkflowCompatibilityValidationResult {
  readonly warnings: Diagnostic[];
  readonly errors: Diagnostic[];
}

const getEffectiveGrading = (config: LoadedGraiderConfig): GradingConfig =>
  config.assignment.grading ?? config.course.grading;

const normalizeWorkflowPath = (workflowPath: string): string => workflowPath.replace(/\\/g, "/");

const createConfiguredWorkflowCandidate = (
  repoRoot: string,
  workflowPath: string
): WorkflowCandidate => {
  const relativePath = normalizeWorkflowPath(workflowPath);

  return {
    absolutePath: path.join(repoRoot, relativePath),
    relativePath
  };
};

const createWorkflowCandidates = (
  config: LoadedGraiderConfig,
  grading: GradingConfig
): WorkflowCandidate[] => {
  if (grading.workflow === undefined) {
    return [];
  }

  const configuredCandidate = createConfiguredWorkflowCandidate(
    config.summary.repoRoot,
    grading.workflow
  );
  const generatedCandidate = createGeneratedWorkflowPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );

  return grading.mode === PRESET_GRADING_MODE
    ? [configuredCandidate, generatedCandidate]
    : [configuredCandidate];
};

const findExistingWorkflowCandidate = (
  candidates: readonly WorkflowCandidate[]
): WorkflowCandidate | undefined =>
  candidates.find((candidate) => fs.existsSync(candidate.absolutePath));

const createWorkflowMissingDiagnostic = (
  grading: GradingConfig,
  candidates: readonly WorkflowCandidate[]
): Diagnostic =>
  createConfigDiagnostic(
    GRADING_WORKFLOW_MISSING_CODE,
    `Configured grading workflow ${String(grading.workflow)} was not found locally.`,
    {
      workflow: grading.workflow,
      checkedPaths: candidates.map((candidate) => candidate.relativePath)
    }
  );

const createWorkflowDispatchUnsupportedDiagnostic = (workflowPath: string): Diagnostic =>
  createConfigDiagnostic(
    WORKFLOW_DISPATCH_UNSUPPORTED_CODE,
    `Configured grading workflow ${workflowPath} does not include workflow_dispatch.`,
    {
      workflow: workflowPath,
      requiredTrigger: WORKFLOW_DISPATCH_TRIGGER
    }
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasWorkflowDispatchString = (value: unknown): boolean =>
  typeof value === "string" && value === WORKFLOW_DISPATCH_TRIGGER;

const hasWorkflowDispatchArray = (value: unknown): boolean =>
  Array.isArray(value) && value.some((item) => hasWorkflowDispatchString(item));

const hasWorkflowDispatchObject = (value: unknown): boolean =>
  isRecord(value) && Object.hasOwn(value, WORKFLOW_DISPATCH_TRIGGER);

const hasWorkflowDispatchTrigger = (workflowDocument: unknown): boolean => {
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

export const validateWorkflowCompatibility = (
  config: LoadedGraiderConfig
): WorkflowCompatibilityValidationResult => {
  const grading = getEffectiveGrading(config);

  if (!grading.enabled || grading.workflow === undefined) {
    return {
      warnings: [],
      errors: []
    };
  }

  const candidates = createWorkflowCandidates(config, grading);
  const workflowCandidate = findExistingWorkflowCandidate(candidates);

  if (workflowCandidate === undefined) {
    return {
      warnings: [],
      errors: [createWorkflowMissingDiagnostic(grading, candidates)]
    };
  }

  const content = fs.readFileSync(workflowCandidate.absolutePath, "utf8");
  const parseResult = parseYaml(content, workflowCandidate.relativePath);

  if (parseResult.status === "failure") {
    return {
      warnings: [],
      errors: [parseResult.diagnostic]
    };
  }

  return hasWorkflowDispatchTrigger(parseResult.value)
    ? {
        warnings: [],
        errors: []
      }
    : {
        warnings: [],
        errors: [createWorkflowDispatchUnsupportedDiagnostic(workflowCandidate.relativePath)]
      };
};
