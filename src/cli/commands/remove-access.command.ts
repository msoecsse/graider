import type { Command } from "commander";
import { registerPlaceholderCommand } from "./placeholder-command.js";

export const registerRemoveAccessCommand = (program: Command): void => {
  registerPlaceholderCommand(program, {
    name: "remove-access",
    description: "Remove student access from assignment repositories.",
    support: "unsupported-in-mvp",
    requireRepositoryRoot: false
  });
};
