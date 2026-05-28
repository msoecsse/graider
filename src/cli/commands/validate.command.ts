import type { Command } from "commander";
import { registerPlaceholderCommand } from "./placeholder-command.js";

export const registerValidateCommand = (program: Command): void => {
  registerPlaceholderCommand(program, {
    name: "validate",
    description: "Validate assignment configuration.",
    support: "supported-placeholder",
    requireRepositoryRoot: true
  });
};
