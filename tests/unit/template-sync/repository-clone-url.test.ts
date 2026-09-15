import { describe, expect, it } from "vitest";
import {
  resolveStudentCloneUrl,
  resolveTemplateCloneUrl
} from "../../../src/template-sync/repository-clone-url.js";

describe("repository clone URL resolution", () => {
  it("resolves configured template identity", () => {
    expect(resolveTemplateCloneUrl("course", "course/template")).toEqual({
      status: "success",
      cloneUrl: "git@github.com:course/template.git"
    });
  });
  it("resolves manifest student identity", () => {
    expect(resolveStudentCloneUrl({ owner: "course", name: "student-lab" })).toEqual({
      status: "success",
      cloneUrl: "git@github.com:course/student-lab.git"
    });
  });
  it("fails safely for invalid identities", () => {
    expect(resolveTemplateCloneUrl("course", "bad").status).toBe("failure");
    expect(resolveStudentCloneUrl({ owner: "", name: "student" }).status).toBe("failure");
  });
});
