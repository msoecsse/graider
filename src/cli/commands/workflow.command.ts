import path from "node:path";
import type { Command } from "commander";
import { loadGraiderConfig } from "../../config/config-loader.js";
import type { RawCourseConfig } from "../../config/config-models.js";
import {
  type CommonCommandOptions,
  normalizeCommonCommandOptions,
  type RawCommonCommandOptions
} from "../../core/command-context.js";
import { createCommandResult, type CommandResult } from "../../core/command-result.js";
import { toForwardSlashPath, toRepositoryRelativePath } from "../../core/paths.js";
import {
  UNSUPPORTED_GRADING_PRESET_CODE,
  WORKFLOW_GENERATION_NOT_CONFIGURED_CODE,
  WORKFLOW_GENERATION_REQUIRES_PRESET_MODE_CODE,
  createConfigDiagnostic
} from "../../diagnostics/error-catalog.js";
import {
  JAVA_JUNIT_CHECKSTYLE_PRESET,
  renderJavaJunitCheckstyleWorkflow
} from "../../workflows/java-junit-checkstyle-workflow.js";
import { createGeneratedWorkflowPath } from "../../workflows/workflow-paths.js";
import { writeWorkflowFile } from "../../workflows/workflow-writer.js";
import { writeCommandResult } from "../output.js";

const WORKFLOW_COMMAND_NAME = "workflow";
const GENERATE_COMMAND_NAME = "generate";
const COMMAND_NAME = "workflow generate";
const PRESET_GRADING_MODE = "preset";
const LEGACY_GRADING_MODE = "custom-workflow";
const EMPTY_COUNT = 0;

export interface WorkflowGenerateCommandRequest {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly options: CommonCommandOptions;
  readonly output?: string;
  readonly force: boolean;
}

interface RawWorkflowGenerateOptions extends RawCommonCommandOptions {
  readonly output?: string;
  readonly force?: boolean;
}

const getEffectiveGrading = (
  courseGrading: RawCourseConfig["grading"],
  assignmentGrading: RawCourseConfig["grading"] | undefined
): RawCourseConfig["grading"] => assignmentGrading ?? courseGrading;

const formatGeneratedFilePath = (repoRoot: string, absolutePath: string): string => {
  try {
    return toRepositoryRelativePath(repoRoot, absolutePath);
  } catch {
    return toForwardSlashPath(path.resolve(absolutePath));
  }
};

const resolveOutputPath = (
  cwd: string,
  repoRoot: string,
  termCode: string,
  assignmentSlug: string,
  output: string | undefined
): {
  absolutePath: string;
  reportPath: string;
} => {
  if (output === undefined) {
    const workflowPath = createGeneratedWorkflowPath(repoRoot, termCode, assignmentSlug);

    return {
      absolutePath: workflowPath.absolutePath,
      reportPath: workflowPath.relativePath
    };
  }

  const absolutePath = path.isAbsolute(output) ? output : path.resolve(cwd, output);

  return {
    absolutePath,
    reportPath: formatGeneratedFilePath(repoRoot, absolutePath)
  };
};

export const runWorkflowGenerateCommand = ({
  cwd,
  assignmentFile,
  options,
  output,
  force
}: WorkflowGenerateCommandRequest): CommandResult => {
  const configResult = loadGraiderConfig({
    cwd,
    assignmentFile
  });

  if (configResult.status === "failure") {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: {
        options
      }
    });
  }

  const grading = getEffectiveGrading(
    configResult.config.course.grading,
    configResult.config.assignment.grading
  );
  const assignmentConfigPath = configResult.config.summary.assignmentConfigPath;

  if (!grading.enabled) {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile: assignmentConfigPath,
      status: "failure",
      warnings: [],
      errors: [
        createConfigDiagnostic(
          WORKFLOW_GENERATION_NOT_CONFIGURED_CODE,
          `Workflow generation requires enabled preset grading in ${assignmentConfigPath}.`,
          {
            assignmentFile: assignmentConfigPath
          }
        )
      ],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary
      }
    });
  }

  const mode = grading.mode ?? LEGACY_GRADING_MODE;

  if (mode !== PRESET_GRADING_MODE) {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile: assignmentConfigPath,
      status: "failure",
      warnings: [],
      errors: [
        createConfigDiagnostic(
          WORKFLOW_GENERATION_REQUIRES_PRESET_MODE_CODE,
          `Workflow generation requires grading.mode: ${PRESET_GRADING_MODE}.`,
          {
            assignmentFile: assignmentConfigPath,
            mode
          }
        )
      ],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        gradingMode: mode
      }
    });
  }

  if (grading.preset !== JAVA_JUNIT_CHECKSTYLE_PRESET) {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile: assignmentConfigPath,
      status: "failure",
      warnings: [],
      errors: [
        createConfigDiagnostic(
          UNSUPPORTED_GRADING_PRESET_CODE,
          `Unsupported grading preset ${String(grading.preset)} for workflow generation.`,
          {
            assignmentFile: assignmentConfigPath,
            preset: grading.preset,
            supportedPreset: JAVA_JUNIT_CHECKSTYLE_PRESET
          }
        )
      ],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        gradingMode: mode,
        preset: grading.preset
      }
    });
  }

  const outputPath = resolveOutputPath(
    cwd,
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug,
    output
  );
  const writeResult = writeWorkflowFile({
    filePath: outputPath.absolutePath,
    content: renderJavaJunitCheckstyleWorkflow({ grading }),
    force
  });
  const errors = writeResult.status === "failure" ? [writeResult.diagnostic] : [];
  const generatedFiles = errors.length > EMPTY_COUNT ? [] : [outputPath.reportPath];

  return createCommandResult({
    commandName: COMMAND_NAME,
    assignmentFile: assignmentConfigPath,
    status: errors.length > EMPTY_COUNT ? "failure" : "success",
    warnings: [],
    errors,
    generatedFiles,
    summary: {
      options,
      ...configResult.config.summary,
      gradingMode: mode,
      preset: grading.preset,
      workflowFile: outputPath.reportPath
    }
  });
};

export const registerWorkflowCommand = (program: Command): void => {
  const workflowCommand = program
    .command(WORKFLOW_COMMAND_NAME)
    .description("Generate and manage local grading workflow files.");

  workflowCommand
    .command(GENERATE_COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .option("--output <path>", "Write workflow to a local output path")
    .option("--force", "Overwrite an existing generated workflow")
    .description("Generate a local grading workflow file.")
    .action((assignmentFile: string, rawOptions: RawWorkflowGenerateOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = runWorkflowGenerateCommand({
        cwd: process.cwd(),
        assignmentFile,
        options,
        force: rawOptions.force === true,
        ...(rawOptions.output === undefined ? {} : { output: rawOptions.output })
      });

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });
};
