import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../database/database.constants';

export type OtpPasswordStatus =
  'PENDIENTE' | 'VERIFICADO' | 'ANULADO' | 'EXPIRADO' | 'BLOQUEADO';

export interface OtpForgetPasswordDatabaseRow {
  id: string;
  persona_id: string;
  codigo_hash: string;
  codigo_encriptado: string | null;
  estado: OtpPasswordStatus;
  fecha_generacion: string;
  fecha_expiracion: string;
  fecha_validacion: string | null;
  intentos_validacion: number;
}

export interface CreateOtpPasswordInput {
  personId: string;
  codeHash: string;
  encryptedCode: string;
  expiresAt: string;
}

const OTP_PASSWORD_COLUMNS = `
  id,
  persona_id,
  codigo_hash,
  codigo_encriptado,
  estado,
  fecha_generacion,
  fecha_expiracion,
  fecha_validacion,
  intentos_validacion
`;

@Injectable()
export class OtpPasswordRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async invalidatePendingForPerson(personId: string): Promise<void> {
    const { error } = await this.supabase
      .from('CODIGOS_OTP_FORGET_PASSWORD')
      .update({ estado: 'ANULADO' })
      .eq('persona_id', personId)
      .eq('estado', 'PENDIENTE');

    if (error) {
      console.error('Error anulando OTP de contraseña anteriores:', {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      throw new InternalServerErrorException({
        code: 'OTP_INVALIDATION_FAILED',
        message: 'No fue posible invalidar los códigos anteriores.',
      });
    }
  }

  async create(
    input: CreateOtpPasswordInput,
  ): Promise<OtpForgetPasswordDatabaseRow> {
    const { data, error } = await this.supabase
      .from('CODIGOS_OTP_FORGET_PASSWORD')
      .insert({
        persona_id: input.personId,
        codigo_hash: input.codeHash,
        codigo_encriptado: input.encryptedCode,
        fecha_expiracion: input.expiresAt,
        estado: 'PENDIENTE',
        intentos_validacion: 0,
        fecha_generacion: new Date().toISOString(),
      })
      .select(OTP_PASSWORD_COLUMNS)
      .single<OtpForgetPasswordDatabaseRow>();

    if (error || !data) {
      console.error('Error creando OTP de contraseña:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
      });

      throw new InternalServerErrorException({
        code: 'OTP_CREATION_FAILED',
        message: 'No fue posible generar el código.',
      });
    }

    return data;
  }

  async countGeneratedSince(personId: string, since: Date): Promise<number> {
    const { count, error } = await this.supabase
      .from('CODIGOS_OTP_FORGET_PASSWORD')
      .select('id', { count: 'exact', head: true })
      .eq('persona_id', personId)
      .gte('fecha_generacion', since.toISOString());

    if (error) {
      console.error('Error contando OTP de contraseña generados:', {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      throw new InternalServerErrorException({
        code: 'OTP_COUNT_FAILED',
        message: 'No fue posible consultar los códigos generados.',
      });
    }

    return count ?? 0;
  }

  async findLatestPendingByPersonId(
    personId: string,
  ): Promise<OtpForgetPasswordDatabaseRow | null> {
    const { data, error } = await this.supabase
      .from('CODIGOS_OTP_FORGET_PASSWORD')
      .select(OTP_PASSWORD_COLUMNS)
      .eq('persona_id', personId)
      .eq('estado', 'PENDIENTE')
      .order('fecha_generacion', { ascending: false })
      .limit(1)
      .maybeSingle<OtpForgetPasswordDatabaseRow>();

    if (error) {
      console.error('Error consultando OTP de contraseña pendiente:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: 'OTP_LOOKUP_FAILED',
        message: 'No fue posible consultar el código.',
      });
    }

    return data ?? null;
  }

  /*
   * Incrementa los intentos solo si nadie más los cambió desde la lectura
   * (control optimista). Devuelve null si otra petición se adelantó, para
   * que no se puedan probar más códigos que el máximo con peticiones en paralelo.
   */
  async incrementAttempts(
    otpId: string,
    currentAttempts: number,
  ): Promise<number | null> {
    const newAttempts = currentAttempts + 1;

    const { data, error } = await this.supabase
      .from('CODIGOS_OTP_FORGET_PASSWORD')
      .update({ intentos_validacion: newAttempts })
      .eq('id', otpId)
      .eq('estado', 'PENDIENTE')
      .eq('intentos_validacion', currentAttempts)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error incrementando intentos del OTP de contraseña:', {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      throw new InternalServerErrorException({
        code: 'OTP_ATTEMPTS_UPDATE_FAILED',
        message: 'No fue posible actualizar los intentos del código.',
      });
    }

    return data ? newAttempts : null;
  }

  async markExpired(otpId: string): Promise<void> {
    await this.updatePendingStatus(otpId, 'EXPIRADO', {
      code: 'OTP_EXPIRATION_UPDATE_FAILED',
      message: 'No fue posible actualizar el estado del código.',
    });
  }

  async markBlocked(otpId: string): Promise<void> {
    await this.updatePendingStatus(otpId, 'BLOQUEADO', {
      code: 'OTP_BLOCK_UPDATE_FAILED',
      message: 'No fue posible bloquear el código.',
    });
  }

  /*
   * Marca el código como verificado. Devuelve false si ya no estaba
   * pendiente (por ejemplo, si otra petición lo verificó antes).
   */
  async markAsVerified(otpId: string, verifiedAt: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('CODIGOS_OTP_FORGET_PASSWORD')
      .update({
        estado: 'VERIFICADO',
        fecha_validacion: verifiedAt,
      })
      .eq('id', otpId)
      .eq('estado', 'PENDIENTE')
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error verificando OTP de contraseña:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: 'OTP_VERIFY_FAILED',
        message: 'No fue posible verificar el código.',
      });
    }

    return Boolean(data);
  }

  private async updatePendingStatus(
    otpId: string,
    status: OtpPasswordStatus,
    failure: { code: string; message: string },
  ): Promise<void> {
    const { error } = await this.supabase
      .from('CODIGOS_OTP_FORGET_PASSWORD')
      .update({ estado: status })
      .eq('id', otpId)
      .eq('estado', 'PENDIENTE');

    if (error) {
      console.error(`Error marcando OTP de contraseña como ${status}:`, {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      throw new InternalServerErrorException(failure);
    }
  }
}
