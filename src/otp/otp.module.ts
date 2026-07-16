import { Module } from "@nestjs/common";
import { EmailsModule } from "../emails/emails.module";
import { PersonsModule } from "../persons/persons.module";
import { StoresModule } from "../stores/stores.module";
import { OtpController } from "./otp.controller";
import { OtpService } from "./otp.service";
import { OtpRepository } from "./repositories/otp.repository";

@Module({
  imports: [
    PersonsModule,
    StoresModule,
    EmailsModule,
  ],
  controllers: [OtpController],
  providers: [
    OtpService,
    OtpRepository,
  ],
  exports: [
    OtpService,
    OtpRepository,
  ],
})
export class OtpModule {}