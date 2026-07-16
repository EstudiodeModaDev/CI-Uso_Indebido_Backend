import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type {
  AuthenticatedRequest,
} from "../interfaces/authenticated-request.interface";
import { ROLES_KEY } from "../decorators/roles.decorartor";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(
        ROLES_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    /*
     * Si el endpoint no declara roles, basta con estar autenticado.
     */
    if (!requiredRoles?.length) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const currentUser = request.user;

    if (!currentUser) {
      throw new ForbiddenException({
        code: "AUTH_USER_NOT_RESOLVED",
        message:
          "No fue posible resolver el usuario autenticado.",
      });
    }

    const hasRequiredRole = requiredRoles.some(
      (requiredRole) =>
        currentUser.roles.includes(requiredRole),
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException({
        code: "INSUFFICIENT_PERMISSIONS",
        message:
          "No tiene permisos para ejecutar esta operación.",
      });
    }

    return true;
  }
}