import { Injectable } from "@nestjs/common";
import type { EmailPayload } from "../interfaces/email-payload.interface";
import type { EmailProvider } from "../interfaces/email-provider.interface";
import type { EmailResult } from "../interfaces/email-result.interface";

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  async send(payload: EmailPayload): Promise<EmailResult> {
    console.log("===== CORREO DE DESARROLLO =====");
    console.log("Para:", payload.to.join(", "));
    console.log("CC:", payload.cc?.join(", ") ?? "Sin copia");
    console.log("Asunto:", payload.subject);
    console.log("Contenido:", payload.html);
    console.log("===============================");

    return {
      success: true,
      provider: "console",
      statusCode: 200,
    };
  }
}