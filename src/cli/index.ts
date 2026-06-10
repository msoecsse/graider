#!/usr/bin/env node

import { Command } from "commander";
import { registerAssignmentCommand } from "./commands/assignment.command.js";
import { registerApplyCommand } from "./commands/apply.command.js";
import { registerArchiveCommand } from "./commands/archive.command.js";
import { registerDashboardCommand } from "./commands/dashboard.command.js";
import { registerGradeCommand } from "./commands/grade.command.js";
import { registerPlanCommand } from "./commands/plan.command.js";
import { registerRemoveAccessCommand } from "./commands/remove-access.command.js";
import { registerReportCommand } from "./commands/report.command.js";
import { registerValidateCommand } from "./commands/validate.command.js";
import { registerWorkflowCommand } from "./commands/workflow.command.js";

export const buildProgram = (): Command => {
  const program = new Command();

  program
    .name("graider")
    .description("CLI-based GitHub assignment management for course repositories.")
    .version("0.1.0");

  registerValidateCommand(program);
  registerAssignmentCommand(program);
  registerDashboardCommand(program);
  registerPlanCommand(program);
  registerApplyCommand(program);
  registerGradeCommand(program);
  registerReportCommand(program);
  registerWorkflowCommand(program);
  registerArchiveCommand(program);
  registerRemoveAccessCommand(program);

  return program;
};

await buildProgram().parseAsync();
