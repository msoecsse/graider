import { describe, expect, it, vi } from "vitest";
import type {
  GitCommandRunner,
  GitCommandBinaryRunner
} from "../../../src/git/git-command-workspace.js";
import { devNull } from "node:os";
import { createMigrationGitRunners } from "../../../src/migration/migration-git.js";
const LAST_CALL = -1;
const captured = vi.hoisted(() => ({
  runGit: vi.fn<GitCommandRunner>(() => Promise.resolve("")),
  runGitBinary: vi.fn<GitCommandBinaryRunner>(() =>
    Promise.resolve({ stdout: new Uint8Array(), stderr: new Uint8Array() })
  )
}));
vi.mock("../../../src/git/dugite-git-runners.js", () => ({
  createDugiteGitRunners: () => captured
}));
describe("migration bundled-Git isolation policy", () => {
  it("removes inherited Git redirection/configuration for text and binary reads", async () => {
    vi.stubEnv("GIT_DIR", "foreign-storage");
    vi.stubEnv("GIT_INDEX_FILE", "foreign-index");
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", "remote.origin.mirror");
    vi.stubEnv("GIT_CONFIG_VALUE_0", "true");
    try {
      const runners = createMigrationGitRunners();
      await runners.runGit({ cwd: "workspace", args: ["status"] });
      await runners.runGitBinary({ cwd: "workspace", args: ["cat-file", "blob", "object"] });
      for (const runner of [captured.runGit, captured.runGitBinary]) {
        const request = runner.mock.calls.at(LAST_CALL)?.[0] as unknown as {
          env: NodeJS.ProcessEnv;
          args: string[];
        };
        expect(request.env.GIT_DIR).toBeUndefined();
        expect(request.env.GIT_INDEX_FILE).toBeUndefined();
        expect(request.env.GIT_CONFIG_COUNT).toBeUndefined();
        expect(request.env.GIT_CONFIG_GLOBAL).toBe(devNull);
        expect(request.env.GIT_NO_REPLACE_OBJECTS).toBe("1");
        expect(request.args).toEqual(
          expect.arrayContaining([
            "core.autocrlf=false",
            "commit.gpgSign=false",
            "push.followTags=false",
            "remote.origin.mirror=false",
            `core.hooksPath=${devNull}`
          ])
        );
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("preserves only explicit operation-scoped credential configuration", async () => {
    const env = {
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_1: "fictional-header",
      GIT_ALTERNATE_OBJECT_DIRECTORIES: "foreign-objects"
    };
    await createMigrationGitRunners().runGit({ cwd: "workspace", args: ["fetch"], env });
    const request = captured.runGit.mock.calls.at(LAST_CALL)?.[0] as unknown as {
      env: NodeJS.ProcessEnv;
    };
    expect(request.env.GIT_CONFIG_VALUE_1).toBe("fictional-header");
    expect(request.env.GIT_CONFIG_COUNT).toBe("2");
    expect(request.env.GIT_ALTERNATE_OBJECT_DIRECTORIES).toBeUndefined();
  });
});
