import {
  BadRequestException,
  Controller,
  Get,
  Param,
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUser as CurrentUserType } from "../common/types/current-user.type";
import { PersonsService } from "./persons.service";
import { Roles } from "src/common/decorators/roles.decorartor";

@Controller("persons")
export class PersonsController {
  constructor(
    private readonly personsService: PersonsService,
  ) {}

  @Roles("TIENDA", "CONTROL_INTERNO")
  @Get(":document")
  async findByDocument(
    @Param("document") document: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    if (!/^[0-9]{5,15}$/.test(document)) {
      throw new BadRequestException({
        code: "INVALID_DOCUMENT_FORMAT",
        message:
          "El documento debe contener entre 5 y 15 dígitos.",
      });
    }

    return this.personsService
      .findActiveByDocumentAndAudit(
        document,
        user,
      );
  }
}