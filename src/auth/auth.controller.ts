import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUser as CurrentUserType } from "../common/types/current-user.type";
import { Roles } from "src/common/decorators/roles.decorartor";

@Controller("auth")
export class AuthController {
  @Get("me")
  getCurrentUser(
    @CurrentUser() user: CurrentUserType,
  ): CurrentUserType {
    return user;
  }
}