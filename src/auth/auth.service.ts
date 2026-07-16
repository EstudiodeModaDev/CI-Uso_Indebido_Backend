import {Inject, Injectable, UnauthorizedException,} from "@nestjs/common";
import type {SupabaseClient, User,} from "@supabase/supabase-js";
import type { CurrentUser } from "../common/types/current-user.type";
import { SUPABASE_CLIENT } from "../database/database.constants";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient, private readonly usersService: UsersService,) {}

  async resolveCurrentUser(accessToken: string,): Promise<CurrentUser> {
    const authUser = await this.validateToken(accessToken);

    return this.usersService.resolveActiveUser(
      authUser.id,
      authUser.email,
    );
  }

  private async validateToken(accessToken: string,): Promise<User> {
    const { data, error } = await this.supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException({
        code: "AUTH_TOKEN_INVALID",
        message: "El token de autenticación es inválido o ha expirado." + error?.message,
      });
    }

    if (!data.user.email) {
      throw new UnauthorizedException({
        code: "AUTH_EMAIL_NOT_FOUND",
        message: "El usuario autenticado no tiene un correo válido.",
      });
    }

    return data.user;
  }
}