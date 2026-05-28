import type { Command } from "commander";
import { registerPlaceholderCommand } from "./placeholder-command.js";

export const registerArchiveCommand = (program: Command): void => {
  registerPlaceholderCommand(program, {
    name: "archive",
    description: "Archive assignment repositories.",
    support: "unsupported-in-mvp",
    requireRepositoryRoot: false
  });
};
