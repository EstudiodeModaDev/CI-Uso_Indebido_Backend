import {
  Inject,
  Injectable,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../../database/database.constants";
import type { AuditEntry } from "../interfaces/audit-entry.interface";

@Injectable()
export class AuditRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const { error } = await this.supabase
      .from("LOG")
      .insert({
        accion: entry.accion,
        usuario: entry.usuario ?? null,
        entidad: entry.entidad ?? null,
        resultado: entry.resultado ?? "EXITOSO",
      });

    if (error) {
      /*
       * La auditoría no debería tumbar la operación principal.
       * Registramos el fallo en el logger del servidor.
       */
      console.error("No fue posible registrar auditoría:", {
        message: error.message,
        code: error.code,
        details: error.details,
        action: entry.accion,
      });
    }
  }
}