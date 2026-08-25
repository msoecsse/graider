import type { StudentRepoEmailTransportStatusResult } from "./ipc.js";
import type {
  StudentRepoEmailSendRequest,
  StudentRepoEmailSendResult,
  StudentRepoEmailSendStatus,
  StudentRepoEmailTransport
} from "./studentRepoEmailTransport.js";

export type StudentRepoEmailMockTransportMode =
  | "success"
  | "failed"
  | "auth_required"
  | "permission_denied";

export class StudentRepoEmailMockTransport implements StudentRepoEmailTransport {
  readonly requests: StudentRepoEmailSendRequest[] = [];

  constructor(
    private readonly mode: StudentRepoEmailMockTransportMode,
    private readonly sentAt = "2027-01-15T12:05:00.000Z"
  ) {}

  async getStatus(): Promise<StudentRepoEmailTransportStatusResult> {
    return {
      schemaVersion: 1,
      status: "configured_placeholder",
      transport: "microsoft_graph",
      sender: null,
      canSend: false,
      diagnostics: [{ message: "Mock transport is available only to tests." }]
    };
  }

  async sendMessage(request: StudentRepoEmailSendRequest): Promise<StudentRepoEmailSendResult> {
    this.requests.push(request);
    const statusByMode: Record<StudentRepoEmailMockTransportMode, StudentRepoEmailSendStatus> = {
      success: "sent",
      failed: "failed",
      auth_required: "auth_required",
      permission_denied: "permission_denied"
    };
    const status = statusByMode[this.mode];
    return {
      schemaVersion: 1,
      notificationKey: request.notificationKey,
      studentId: request.recipient.studentId,
      email: request.recipient.email,
      status,
      providerMessageId: status === "sent" ? `mock-${request.notificationKey.slice(0, 12)}` : null,
      sentAt: status === "sent" ? this.sentAt : null,
      errorCode: status === "sent" ? null : status,
      errorMessage: status === "sent" ? null : `Mock transport returned ${status}.`,
      diagnostics: status === "sent" ? [] : [{ message: `Mock transport returned ${status}.` }]
    };
  }
}
