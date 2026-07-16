import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../../database/database.constants";
import type { DatabaseUser } from "../interfaces/database-user.interface";

interface UserDatabaseRow {
  id: number;
  auth_user_id: string;
  email: string;
  persona_id: string | null;
  estado: "ACTIVO" | "INACTIVO";
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

  async findByAuthUserId(
    authUserId: string,
  ): Promise<DatabaseUser | null> {
    const { data: user, error: userError } = await this.supabase
      .from("USUARIOS")
      .select(`
        id,
        auth_user_id,
        correo,
        id_persona,
        estado
      `)
      .eq("auth_user_id", authUserId)
      .maybeSingle<UserDatabaseRow>();

    if (userError) {
      console.error("Error consultando USUARIOS:", {
        message: userError.message,
        code: userError.code,
        details: userError.details,
        hint: userError.hint,
      });

      throw new InternalServerErrorException({
        code: "USER_LOOKUP_FAILED",
        message: "No fue posible consultar el usuario.",
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

  private async findRolesByUserId(
    userId: number,
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("USUARIOS_ROLES")
      .select(`
        ROLES (
          nombre
        )
      `)
      .eq("id_usuario", userId)
      .returns<UserRoleDatabaseRow[]>();

    if (error) {
      console.error("Error consultando roles del usuario:", {
        userId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: "USER_ROLES_LOOKUP_FAILED",
        message: "No fue posible consultar los roles del usuario.",
      });
    }

    console.log("Relaciones de roles obtenidas:", data);

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

      return roleList
        .map((role) => role.nombre)
        .filter(Boolean);
    });
  }
}