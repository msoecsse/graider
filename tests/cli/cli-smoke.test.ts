import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

describe("graider CLI smoke test", () => {
  it("prints help", () => {
    const output = execFileSync("node", ["--import", "tsx", "src/cli/index.ts", "--help"], {
      encoding: "utf8"
    });

    expect(output).toContain("graider");
    expect(output).toContain("validate");
  });
});
