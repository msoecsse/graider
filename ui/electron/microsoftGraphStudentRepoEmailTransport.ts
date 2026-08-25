import type { StudentRepoEmailTransportStatusResult } from "./ipc.js";
import { getStudentRepoEmailTransportStatus } from "./studentRepoEmailTransportStatusService.js";
import type {
  StudentRepoEmailSendRequest,
  StudentRepoEmailSendResult,
  StudentRepoEmailTransport
} from "./studentRepoEmailTransport.js";

// Slice N defines the Graph boundary only. Slice O will add approved auth and sendMail execution.
export class MicrosoftGraphStudentRepoEmailTransport implements StudentRepoEmailTransport {
  async getStatus(): Promise<StudentRepoEmailTransportStatusResult> {
    return getStudentRepoEmailTransportStatus();
  }

  async sendMessage(request: StudentRepoEmailSendRequest): Promise<StudentRepoEmailSendResult> {
    return {
      schemaVersion: 1,
      notificationKey: request.notificationKey,
      studentId: request.recipient.studentId,
      email: request.recipient.email,
      status: "transport_unavailable",
      providerMessageId: null,
      sentAt: null,
      errorCode: "microsoft_graph_not_configured",
      errorMessage: "Microsoft Graph sending is not configured in this build.",
      diagnostics: [{ message: "Microsoft Graph sending is not configured in this build." }]
    };
  }
}
