const GIT_COMMIT_SHA_LENGTH = 40;

export const makeTestGitSha = (character: string): string =>
  character.repeat(GIT_COMMIT_SHA_LENGTH);
