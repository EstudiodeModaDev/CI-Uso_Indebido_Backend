import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../../database/database.constants";

export interface CreateEmailLogInput {
  recipient: string;
  subject: string;
  provider: string;
  status: "ENVIADO" | "FALLIDO";
  referenceType?: string;
  referenceId?: string;
  attempts?: number;
  statusCode?: number;
  errorDetails?: string;
}

@Injectable()
export class EmailLogsRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async record(input: CreateEmailLogInput): Promise<void> {
    const { error } = await this.supabase
      .from("ENVIOS_CORREO")
      .insert({
        destinatario: input.recipient,
        asunto: input.subject,
        proveedor: input.provider,
        estado: input.status,
        referencia_tipo: input.referenceType ?? null,
        referencia_id: input.referenceId ?? null,
        intentos: input.attempts ?? 1,
        codigo_respuesta: input.statusCode ?? null,
        detalle_error: input.errorDetails
          ? input.errorDetails.slice(0, 1000)
          : null,
      });

    if (error) {
      console.error("No fue posible registrar el envío de correo:", {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      console.log(error.message)

      throw new InternalServerErrorException({
        code: "EMAIL_LOG_FAILED",
        message:
          "No fue posible registrar el resultado del envío de correo.",
      });
    }
  }
}