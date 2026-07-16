export interface EmailPayload {
  to: string[];
  subject: string;
  html: string;

  cc?: string[];

  referenceType?: string;
  referenceId?: string;
}