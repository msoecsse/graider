import type { Command } from "commander";
import { registerPlaceholderCommand } from "./placeholder-command.js";

export const registerReportCommand = (program: Command): void => {
  registerPlaceholderCommand(program, {
    name: "report",
    description: "Generate assignment reports.",
    support: "supported-placeholder",
    requireRepositoryRoot: false
  });
};
