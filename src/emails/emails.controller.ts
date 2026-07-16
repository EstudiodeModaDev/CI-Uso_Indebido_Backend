import { Controller, Post } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUser as CurrentUserType } from "../common/types/current-user.type";
import { EmailsService } from "./emails.service";
import { Roles } from "src/common/decorators/roles.decorartor";

@Controller("emails")
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
  ) {}

  @Roles("CONTROL_INTERNO")
  @Post("test")
  async sendTestEmail(
    @CurrentUser() user: CurrentUserType,
  ) {
    await this.emailsService.send({
      to: [user.correo],
      subject: "Prueba de correo API Descuentos",
      html: `
        <h2>Correo de prueba</h2>
        <p>El módulo de correos está funcionando correctamente.</p>
      `,
      referenceType: "TEST",
    });

    return {
      success: true,
      message: "Correo procesado correctamente.",
    };
  }
}