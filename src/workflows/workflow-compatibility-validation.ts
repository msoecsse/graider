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
import {
  createGeneratedWorkflowPath,
  createLocalWorkflowPathCandidates
} from "./workflow-paths.js";
import {
  WORKFLOW_DISPATCH_TRIGGER,
  hasWorkflowDispatchTrigger
} from "./workflow-dispatch-validation.js";

const PRESET_GRADING_MODE = "preset";

type GradingConfig = RawCourseConfig["grading"];

interface WorkflowCandidate {
  readonly absolutePath: string;
  readonly relativePath: string;
}

export interface WorkflowCompatibilityValidationResult {
  readonly warnings: Diagnostic[];
  readonly errors: Diagnostic[];
  readonly workflowStatus: "not_required" | "found" | "missing" | "invalid";
}

const getEffectiveGrading = (config: LoadedGraiderConfig): GradingConfig =>
  config.assignment.grading ?? config.course.grading;

const createConfiguredWorkflowCandidate = (
  repoRoot: string,
  workflowPath: string
): WorkflowCandidate => {
  return {
    absolutePath: path.join(repoRoot, workflowPath),
    relativePath: workflowPath
  };
};

const createWorkflowCandidates = (
  config: LoadedGraiderConfig,
  grading: GradingConfig
): WorkflowCandidate[] => {
  if (grading.workflow === undefined) {
    return [];
  }

  const configuredCandidates = createLocalWorkflowPathCandidates(grading.workflow).map(
    (workflowPath) => createConfiguredWorkflowCandidate(config.summary.repoRoot, workflowPath)
  );
  const generatedCandidate = createGeneratedWorkflowPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );

  return grading.mode === PRESET_GRADING_MODE
    ? [...configuredCandidates, generatedCandidate]
    : configuredCandidates;
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

export const validateWorkflowCompatibility = (
  config: LoadedGraiderConfig
): WorkflowCompatibilityValidationResult => {
  const grading = getEffectiveGrading(config);

  if (!grading.enabled || grading.workflow === undefined) {
    return {
      warnings: [],
      errors: [],
      workflowStatus: "not_required"
    };
  }

  const candidates = createWorkflowCandidates(config, grading);
  const workflowCandidate = findExistingWorkflowCandidate(candidates);

  if (workflowCandidate === undefined) {
    return {
      warnings: [],
      errors: [createWorkflowMissingDiagnostic(grading, candidates)],
      workflowStatus: "missing"
    };
  }

  const content = fs.readFileSync(workflowCandidate.absolutePath, "utf8");
  const parseResult = parseYaml(content, workflowCandidate.relativePath);

  if (parseResult.status === "failure") {
    return {
      warnings: [],
      errors: [parseResult.diagnostic],
      workflowStatus: "invalid"
    };
  }

  return hasWorkflowDispatchTrigger(parseResult.value)
    ? {
        warnings: [],
        errors: [],
        workflowStatus: "found"
      }
    : {
        warnings: [],
        errors: [createWorkflowDispatchUnsupportedDiagnostic(workflowCandidate.relativePath)],
        workflowStatus: "invalid"
      };
};
