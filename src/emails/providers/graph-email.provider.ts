import { Injectable } from "@nestjs/common";
import { GraphMailService } from "../../graph/services/graph-mail.service";
import type { EmailPayload } from "../interfaces/email-payload.interface";
import type { EmailProvider } from "../interfaces/email-provider.interface";
import type { EmailResult } from "../interfaces/email-result.interface";

@Injectable()
export class GraphEmailProvider
  implements EmailProvider
{
  constructor(
    private readonly graphMailService: GraphMailService,
  ) {}

  async send(
    payload: EmailPayload,
  ): Promise<EmailResult> {
    const result =
      await this.graphMailService.send({
        to: payload.to,
        cc: payload.cc,
        subject: payload.subject,
        html: payload.html,
      });

    return {
      success: result.success,
      provider: "microsoft-graph",
      statusCode: result.statusCode,
      errorMessage: result.errorMessage,
    };
  }
}