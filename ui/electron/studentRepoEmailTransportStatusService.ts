import type { StudentRepoEmailTransportStatusResult } from "./ipc.js";

export const getStudentRepoEmailTransportStatus = (): StudentRepoEmailTransportStatusResult => ({
  schemaVersion: 1,
  status: "not_configured",
  transport: "microsoft_graph",
  sender: null,
  canSend: false,
  diagnostics: [
    {
      message:
        "Email sending is not configured yet. You can still preview and copy repository emails."
    },
    {
      message:
        "Microsoft 365 sending will require campus-approved configuration before it can be used."
    }
  ]
});
