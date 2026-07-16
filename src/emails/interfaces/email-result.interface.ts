export interface EmailResult {
  success: boolean;
  provider: string;
  statusCode?: number;
  errorMessage?: string;
}