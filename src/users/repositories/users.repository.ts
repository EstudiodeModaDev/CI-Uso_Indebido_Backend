import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../database/database.constants';
import type { DatabaseUser } from '../interfaces/database-user.interface';

interface UserDatabaseRow {
  id: number;
  auth_user_id: string;
  email: string;
  persona_id: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
}

interface UserRoleDatabaseRow {
  ROLES:
    | {
        nombre: string;
      }
    | {
        nombre: string;
      }[]
    | null;
}

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async findByAuthUserId(authUserId: string): Promise<DatabaseUser | null> {
    const { data: user, error: userError } = await this.supabase
      .from('USUARIOS')
      .select(
        `
        id,
        auth_user_id,
        correo,
        id_persona,
        estado
      `,
      )
      .eq('auth_user_id', authUserId)
      .maybeSingle<UserDatabaseRow>();

    if (userError) {
      console.error('Error consultando USUARIOS:', {
        message: userError.message,
        code: userError.code,
        details: userError.details,
        hint: userError.hint,
      });

      throw new InternalServerErrorException({
        code: 'USER_LOOKUP_FAILED',
        message: 'No fue posible consultar el usuario.',
      });
    }

    if (!user) {
      return null;
    }

    const roles = await this.findRolesByUserId(user.id);

    return {
      id: user.id,
      authUserId: user.auth_user_id,
      email: user.email,
      personId: user.persona_id,
      status: user.estado,
      roles,
    };
  }

  async findActiveAuthUserIdByPersonId(
    personId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('USUARIOS')
      .select('auth_user_id')
      .eq('id_persona', personId)
      .eq('estado', 'ACTIVO')
      .limit(1)
      .maybeSingle<{ auth_user_id: string | null }>();

    if (error) {
      console.error('Error consultando usuario por persona:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: 'USER_LOOKUP_FAILED',
        message: 'No fue posible consultar el usuario.',
      });
    }

    return data?.auth_user_id ?? null;
  }

  /*
   * Genera un token de recuperación de Supabase Auth sin enviar correo.
   * El front lo canjea con supabase.auth.verifyOtp({ token_hash, type: 'recovery' })
   * para obtener una sesión temporal y actualizar la contraseña.
   */
  async generateRecoveryTokenHash(authUserId: string): Promise<string> {
    const { data: userData, error: userError } =
      await this.supabase.auth.admin.getUserById(authUserId);

    const email = userData?.user?.email;

    if (userError || !email) {
      console.error('Error consultando usuario de Auth:', {
        message: userError?.message,
        code: userError?.code,
      });

      throw new InternalServerErrorException({
        code: 'AUTH_USER_LOOKUP_FAILED',
        message: 'No fue posible consultar el usuario.',
      });
    }

    const { data, error } = await this.supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    const tokenHash = data?.properties?.hashed_token;

    if (error || !tokenHash) {
      console.error('Error generando token de recuperación:', {
        message: error?.message,
        code: error?.code,
      });

      throw new InternalServerErrorException({
        code: 'RECOVERY_TOKEN_FAILED',
        message: 'No fue posible preparar el cambio de contraseña.',
      });
    }

    return tokenHash;
  }

  private async findRolesByUserId(userId: number): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('USUARIOS_ROLES')
      .select(
        `
        ROLES (
          nombre
        )
      `,
      )
      .eq('id_usuario', userId)
      .returns<UserRoleDatabaseRow[]>();

    if (error) {
      console.error('Error consultando roles del usuario:', {
        userId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: 'USER_ROLES_LOOKUP_FAILED',
        message: 'No fue posible consultar los roles del usuario.',
      });
    }

    if (!data?.length) {
      return [];
    }

    return data.flatMap((relation) => {
      if (!relation.ROLES) {
        return [];
      }

      const roleList = Array.isArray(relation.ROLES)
        ? relation.ROLES
        : [relation.ROLES];

      return roleList.map((role) => role.nombre).filter(Boolean);
    });
  }
}
