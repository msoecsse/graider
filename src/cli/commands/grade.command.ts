import type { Command } from "commander";
import { registerPlaceholderCommand } from "./placeholder-command.js";

export const registerGradeCommand = (program: Command): void => {
  registerPlaceholderCommand(program, {
    name: "grade",
    description: "Run assignment grading.",
    support: "supported-placeholder",
    requireRepositoryRoot: false
  });
};
