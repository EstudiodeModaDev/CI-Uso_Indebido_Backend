import {ForbiddenException, Injectable, UnauthorizedException,} from "@nestjs/common";
import type { CurrentUser } from "../common/types/current-user.type";
import { UsersRepository } from "./repositories/users.repository";

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository,) {}

  async resolveActiveUser(authUserId: string, authEmail?: string,): Promise<CurrentUser> {
    const user = await this.usersRepository.findByAuthUserId(authUserId);

    if (!user) {
      throw new UnauthorizedException({
        code: "USER_NOT_REGISTERED",
        message: "El usuario autenticado no está registrado en la aplicación.",
      });
    }

    if (user.status !== "ACTIVO") {
      throw new ForbiddenException({
        code: "USER_INACTIVE",
        message: "El usuario se encuentra inactivo.",
      });
    }

    if (user.roles.length === 0) {
      throw new ForbiddenException({
        code: "USER_WITHOUT_ROLES",
        message:"El usuario no tiene roles activos asignados.",
      });
    }

    /*
     * La identidad principal viene de Supabase Auth.
     * El rol siempre viene de nuestra base de datos.
     */
    return {
      id: user.id,
      auth_user_id: user.authUserId,
      correo: authEmail ?? user.email,
      id_persona: user.personId,
      roles: user.roles,
    };
  }
}