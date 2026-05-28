import type { Command } from "commander";
import { registerPlaceholderCommand } from "./placeholder-command.js";

export const registerPlanCommand = (program: Command): void => {
  registerPlaceholderCommand(program, {
    name: "plan",
    description: "Create an assignment execution plan.",
    support: "supported-placeholder",
    requireRepositoryRoot: false
  });
};
