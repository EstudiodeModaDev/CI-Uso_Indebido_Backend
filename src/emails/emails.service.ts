import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { EMAIL_PROVIDER } from "./emails.constants";
import type { EmailPayload } from "./interfaces/email-payload.interface";
import type { EmailProvider } from "./interfaces/email-provider.interface";
import type { EmailResult } from "./interfaces/email-result.interface";
import { EmailLogsRepository } from "./repositories/email-logs.repository";

@Injectable()
export class EmailsService {
  constructor(
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,

    private readonly emailLogsRepository: EmailLogsRepository,
  ) {}

  async send(payload: EmailPayload): Promise<EmailResult> {
    let result: EmailResult;

    try {
      result = await this.emailProvider.send(payload);
    } catch (error) {
      result = {
        success: false,
        provider: "unknown",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Error desconocido enviando correo.",
      };
    }

    /*
     * Se registra un log por cada destinatario principal.
     */
    for (const recipient of payload.to) {
      await this.emailLogsRepository.record({
        recipient,
        subject: payload.subject,
        provider: result.provider,
        status: result.success ? "ENVIADO" : "FALLIDO",
        referenceType: payload.referenceType,
        referenceId: payload.referenceId,
        statusCode: result.statusCode,
        errorDetails: result.errorMessage,
      });
    }

    return result;
  }
}