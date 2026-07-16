import type { EmailPayload } from "./email-payload.interface";
import type { EmailResult } from "./email-result.interface";

export interface EmailProvider {
  send(payload: EmailPayload): Promise<EmailResult>;
}