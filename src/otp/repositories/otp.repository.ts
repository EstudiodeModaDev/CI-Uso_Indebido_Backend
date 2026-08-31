import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../../database/database.constants";
import type { OtpRecord } from "../interfaces/otp-record.interface";

interface OtpDatabaseRow {
  id: string;
  persona_id: string;
  tienda_generacion_id: number;
  tienda_redencion_id: number | null;
  codigo_hash: string;
  codigo_encriptado: string | null;
  fecha_generacion: Date;
  fecha_expiracion: Date;
  fecha_redencion: Date | null;
  valor_compra: number;
  intentos_validacion: number;
  estado: OtpRecord["estado"];
  fecha_validacion: Date | null;
  invoice_number: number | null;
}

export interface CreateOtpInput {
  personId: string;
  generationStoreId: number;
  codeHash: string;
  encryptedCode: string;
  expiresAt: string;
}

export interface RedeemOtpInput {
  otpId: string;
  redemptionStoreId: number;
  purchaseValue: number;
  redeemedAt: string;
  invoiceNumber: number
}

export interface OtpHistoryRecord extends OtpRecord {
  tienda_generacion_nombre?: string | null;
  tienda_redencion_nombre?: string | null;
}

export interface AdminOtpFilters {
  personId?: string;
  generationStoreId?: number;
  redemptionStoreId?: number;
  page: number;
  pageSize: number;
}

export interface AdminOtpResult {
  rows: OtpRecord[];
  total: number;
}

@Injectable()
export class OtpRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async invalidatePendingForPerson(
    personId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("CODIGOS_OTP")
      .update({
        estado: "ANULADO",
      })
      .eq("persona_id", personId)
      .eq("estado", "PENDIENTE");

    if (error) {
      console.error("Error anulando OTP anteriores:", {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      throw new InternalServerErrorException({
        code: "OTP_INVALIDATION_FAILED",
        message:
          "No fue posible invalidar los códigos anteriores.",
      });
    }
  }

  async create(input: CreateOtpInput): Promise<OtpRecord> {
    const { data, error } = await this.supabase
      .from("CODIGOS_OTP")
      .insert({
        persona_id: input.personId,
        tienda_generacion_id:
          input.generationStoreId,
        codigo_hash: input.codeHash,
        codigo_encriptado: input.encryptedCode,
        fecha_expiracion: input.expiresAt,
        estado: "PENDIENTE",
        intentos_validacion: 0,
        fecha_generacion: new Date()
      })
      .select(`
        id,
        persona_id,
        tienda_generacion_id,
        tienda_redencion_id,
        codigo_hash,
        codigo_encriptado,
        fecha_generacion,
        fecha_expiracion,
        fecha_redencion,
        valor_compra,
        intentos_validacion,
        estado,
        invoice_number
      `)
      .single<OtpDatabaseRow>();

    if (error || !data) {
      console.error("Error creando OTP:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
      });

      throw new InternalServerErrorException({
        code: "OTP_CREATION_FAILED",
        message: "No fue posible generar el código.",
      });
    }

    return this.mapRow(data);
  }

  private mapRow(row: OtpDatabaseRow): OtpRecord {
    return {
      id: row.id,
      persona_id: row.persona_id,
      tienda_generacion_id: row.tienda_generacion_id,
      tienda_redencion_id: row.tienda_redencion_id,
      codigo_hash: row.codigo_hash,
      codigo_encriptado: row.codigo_encriptado,
      fecha_generacion: row.fecha_generacion,
      fecha_expiracion: row.fecha_expiracion,
      fecha_redencion: row.fecha_redencion,
      valor_compra: row.valor_compra,
      intentos_validacion: row.intentos_validacion,
      estado: row.estado,
      fecha_validacion: row.fecha_validacion,
      invoice_number: row.invoice_number
    };
  }

  async findLatestPendingByPersonId(
    personId: string,
  ): Promise<OtpRecord | null> {
    const { data, error } = await this.supabase
      .from("CODIGOS_OTP")
      .select(`
        id,
        persona_id,
        tienda_generacion_id,
        tienda_redencion_id,
        codigo_hash,
        codigo_encriptado,
        fecha_generacion,
        fecha_expiracion,
        fecha_redencion,
        valor_compra,
        intentos_validacion,
        estado,
        invoice_number
      `)
      .eq("persona_id", personId)
      .eq("estado", "PENDIENTE")
      .order("fecha_generacion", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle<OtpDatabaseRow>();

    if (error) {
      console.error("Error consultando OTP pendiente:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: "OTP_LOOKUP_FAILED",
        message: "No fue posible consultar el código.",
      });
    }

    return data ? this.mapRow(data) : null;
  }

  async findHistoryByPersonId(
    personId: string,
  ): Promise<OtpHistoryRecord[]> {
    const { data, error } = await this.supabase
      .from("CODIGOS_OTP")
      .select(`
        id,
        persona_id,
        tienda_generacion_id,
        tienda_redencion_id,
        codigo_hash,
        codigo_encriptado,
        fecha_generacion,
        fecha_expiracion,
        fecha_redencion,
        valor_compra,
        intentos_validacion,
        estado,
        fecha_validacion,
        invoice_number
      `)
      .eq("persona_id", personId)
      .in("estado", [
        "REDIMIDO",
        "EXPIRADO",
        "ANULADO",
      ])
      .order("fecha_generacion", {
        ascending: false,
      });

    if (error) {
      console.error("Error consultando historial OTP:" + error.message, {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: "OTP_HISTORY_LOOKUP_FAILED",
        message:
          "No fue posible consultar el historial de cÃ³digos.",
      });
    }

    return (data ?? []).map((row) =>
      this.mapRow(row as OtpDatabaseRow),
    );
  }

  async findAllWithFilters(
    filters: AdminOtpFilters,
  ): Promise<AdminOtpResult> {
    let query = this.supabase
      .from("CODIGOS_OTP")
      .select(
        `
        id,
        persona_id,
        tienda_generacion_id,
        tienda_redencion_id,
        codigo_hash,
        codigo_encriptado,
        fecha_generacion,
        fecha_expiracion,
        fecha_redencion,
        valor_compra,
        intentos_validacion,
        estado,
        fecha_validacion,
        invoice_number
      `,
        { count: "exact" },
      );

    if (filters.personId) {
      query = query.eq("persona_id", filters.personId);
    }

    if (filters.generationStoreId !== undefined) {
      query = query.eq(
        "tienda_generacion_id",
        filters.generationStoreId,
      );
    }

    if (filters.redemptionStoreId !== undefined) {
      query = query.eq(
        "tienda_redencion_id",
        filters.redemptionStoreId,
      );
    }

    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;

    const { data, error, count } = await query
      .order("fecha_generacion", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error consultando codigos OTP (admin):", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: "OTP_ADMIN_LOOKUP_FAILED",
        message: "No fue posible consultar los códigos.",
      });
    }

    return {
      rows: (data ?? []).map((row) =>
        this.mapRow(row as OtpDatabaseRow),
      ),
      total: count ?? 0,
    };
  }

  async incrementAttempts(
    otpId: string,
    currentAttempts: number,
  ): Promise<number> {
    const newAttempts = currentAttempts + 1;

    const { error } = await this.supabase
      .from("CODIGOS_OTP")
      .update({
        intentos: newAttempts,
      })
      .eq("id", otpId)
      .eq("estado", "PENDIENTE");

    if (error) {
      console.error("Error incrementando intentos del OTP:", {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      throw new InternalServerErrorException({
        code: "OTP_ATTEMPTS_UPDATE_FAILED",
        message:
          "No fue posible actualizar los intentos del código.",
      });
    }

    return newAttempts;
  }

  async markExpired(otpId: string): Promise<void> {
    const { error } = await this.supabase
      .from("CODIGOS_OTP")
      .update({
        estado: "EXPIRADO",
      })
      .eq("id", otpId)
      .eq("estado", "PENDIENTE");

    if (error) {
      console.error("Error marcando OTP como expirado:", {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      throw new InternalServerErrorException({
        code: "OTP_EXPIRATION_UPDATE_FAILED",
        message:
          "No fue posible actualizar el estado del código.",
      });
    }
  }

  async markBlocked(otpId: string): Promise<void> {
    const { error } = await this.supabase
      .from("CODIGOS_OTP")
      .update({
        estado: "BLOQUEADO",
      })
      .eq("id", otpId)
      .eq("estado", "PENDIENTE");

    if (error) {
      console.error("Error bloqueando OTP:", {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      throw new InternalServerErrorException({
        code: "OTP_BLOCK_UPDATE_FAILED",
        message:
          "No fue posible bloquear el código.",
      });
    }
  }

  async markAsRedeemed(
    input: RedeemOtpInput,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("CODIGOS_OTP")
      .update({
        estado: "REDIMIDO",
        tienda_redencion_id: input.redemptionStoreId,
        fecha_redencion: input.redeemedAt,
        valor_compra: input.purchaseValue,
        invoice_number: input.invoiceNumber
      })
      .eq("id", input.otpId)
      .eq("estado", "PENDIENTE")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Error redimiendo OTP:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: "OTP_REDEEM_FAILED",
        message: "No fue posible redimir el código.",
      });
    }

    return Boolean(data);
  }
}
