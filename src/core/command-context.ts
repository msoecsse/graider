export interface CommonCommandOptions {
  json: boolean;
  verbose: boolean;
  yes: boolean;
}

export interface CommandContext {
  commandName: string;
  cwd: string;
  assignmentFile: string;
  assignmentPath: string;
  repoRoot?: string;
  assignmentRelativePath?: string;
  options: CommonCommandOptions;
}

export interface RawCommonCommandOptions {
  json?: boolean;
  verbose?: boolean;
  yes?: boolean;
}

export const normalizeCommonCommandOptions = (
  options: RawCommonCommandOptions
): CommonCommandOptions => ({
  json: options.json === true,
  verbose: options.verbose === true,
  yes: options.yes === true
});
