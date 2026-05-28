#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("graider")
  .description("CLI-based GitHub assignment management for course repositories.")
  .version("0.1.0");

program
  .command("validate")
  .argument("<assignment-file>")
  .option("--json", "Emit JSON output")
  .option("--verbose", "Emit verbose diagnostics")
  .description("Validate assignment configuration.")
  .action((assignmentFile: string, options: { json?: boolean; verbose?: boolean }) => {
    const result = {
      commandName: "validate",
      assignmentFile,
      status: "success",
      exitCode: 0,
      warnings: [],
      errors: [],
      options
    };

    if (options.json === true) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`graider validate: ${assignmentFile}`);
    }
  });

program.parse();
