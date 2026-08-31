import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUser as CurrentUserType } from "../common/types/current-user.type";
import { StoresService } from "./stores.service";
import { Roles } from "src/common/decorators/roles.decorartor";

@Controller("stores")
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
  ) {}

  @Get("me")
  async getCurrentStore(
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.storesService.resolveCurrentStore(user);
  }

  @Roles("CONTROL_INTERNO")
  @Get()
  async listStores() {
    return this.storesService.listAll();
  }
}