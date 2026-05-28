import type { Command } from "commander";
import { registerPlaceholderCommand } from "./placeholder-command.js";

export const registerApplyCommand = (program: Command): void => {
  registerPlaceholderCommand(program, {
    name: "apply",
    description: "Apply assignment repository changes.",
    support: "supported-placeholder",
    requireRepositoryRoot: false
  });
};
