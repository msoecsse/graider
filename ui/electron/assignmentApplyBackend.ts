import path from "node:path";
import type * as Backend from "../dist-electron/assignmentApplyBackend.cjs";
import type { AssignmentApplyJsonResponse } from "./ipc.js";

export const runManagedAssignmentApply = async (
  request: Parameters<typeof Backend.runManagedAssignmentApply>[0]
): Promise<AssignmentApplyJsonResponse> => {
  const backend = require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "assignmentApplyBackend.cjs"
    )
  ) as typeof Backend;
  return await backend.runManagedAssignmentApply(request);
};
