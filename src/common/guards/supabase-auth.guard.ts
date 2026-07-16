import {CanActivate, ExecutionContext, Injectable, UnauthorizedException,} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "../../auth/auth.service";
import {IS_PUBLIC_KEY,} from "../decorators/public.decorator";
import type {AuthenticatedRequest,} from "../interfaces/authenticated-request.interface";
import { extractBearerToken } from "src/auth/auth.token.util";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext,): Promise<boolean> {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    if (isPublic) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: "AUTH_TOKEN_MISSING",
        message: "Debe enviar un token de autenticación.",
      });
    }

    request.user = await this.authService.resolveCurrentUser(token);

    return true;
  }
}