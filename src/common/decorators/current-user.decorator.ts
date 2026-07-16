import {createParamDecorator, ExecutionContext,} from "@nestjs/common";
import type { AuthenticatedRequest } from "../interfaces/authenticated-request.interface";
import type { CurrentUser as CurrentUserType } from "../types/current-user.type";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext,): CurrentUserType => {
    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new Error(
        "CurrentUser fue utilizado en una ruta sin autenticación.",
      );
    }

    return request.user;
  },
);