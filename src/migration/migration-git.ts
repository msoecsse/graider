import { devNull } from "node:os";
import { createDugiteGitRunners, type DugiteGitRunners } from "../git/dugite-git-runners.js";
import { createAuthenticatedDugiteGitWorkspace } from "../git/dugite-git-workspace-context.js";
/** Same bundled engine/credential resolver, with a fixed migration policy. Neither
 * ambient config nor inherited Git environment may redirect storage, transform
 * candidate bytes, sign, run hooks, or extend an explicit publication refspec.
 */
export const createMigrationGitRunners = (): DugiteGitRunners => {
  const runners = createDugiteGitRunners();
  const environment = (supplied?: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...supplied };
    // Dugite overlays this object on process.env, so omitted keys would be
    // inherited again. Explicit undefined entries remove them at child spawn.
    for (const key of Object.keys(env))
      if (key.toUpperCase().startsWith("GIT_")) env[key] = undefined;
    // Only explicit executor-owned authentication config survives. Never read or
    // propagate credential config directly from the process environment.
    if (supplied)
      for (const [key, value] of Object.entries(supplied))
        if (/^GIT_CONFIG_(?:COUNT|KEY_[0-9]+|VALUE_[0-9]+)$/u.test(key)) env[key] = value;
    return {
      ...env,
      LOCAL_GIT_DIRECTORY: "",
      GIT_EXEC_PATH: "",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_SYSTEM: devNull,
      GIT_CONFIG_GLOBAL: devNull,
      GIT_ATTR_NOSYSTEM: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_NO_LAZY_FETCH: "1",
      GIT_TERMINAL_PROMPT: "0"
    };
  };
  const policy = [
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.safecrlf=false",
    "-c",
    `core.hooksPath=${devNull}`,
    "-c",
    "commit.gpgSign=false",
    "-c",
    "push.followTags=false",
    "-c",
    "push.recurseSubmodules=no",
    "-c",
    "remote.origin.mirror=false"
  ];
  return {
    runGit: (request) =>
      runners.runGit({
        ...request,
        args: [...policy, ...request.args],
        env: environment(request.env)
      }),
    runGitBinary: (request) =>
      runners.runGitBinary({
        ...request,
        args: [...policy, ...request.args],
        env: environment(request.env)
      })
  };
};
export const createAuthenticatedMigrationGitWorkspace = (token: string) =>
  createAuthenticatedDugiteGitWorkspace(token, createMigrationGitRunners());
