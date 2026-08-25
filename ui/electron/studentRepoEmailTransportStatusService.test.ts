import { describe, expect, it } from "vitest";
import { getStudentRepoEmailTransportStatus } from "./studentRepoEmailTransportStatusService";

describe("studentRepoEmailTransportStatusService", () => {
  it("returns a non-sending Microsoft Graph placeholder without credentials", () => {
    const status = getStudentRepoEmailTransportStatus();
    expect(status).toMatchObject({
      schemaVersion: 1,
      status: "not_configured",
      transport: "microsoft_graph",
      sender: null,
      canSend: false
    });
    expect(JSON.stringify(status)).not.toMatch(/token|secret|authorization/iu);
    expect(status.diagnostics.map((item) => item.message).join(" ")).toContain(
      "Email sending is not configured yet"
    );
  });
});
