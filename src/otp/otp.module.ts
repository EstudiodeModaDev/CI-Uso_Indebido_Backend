import { Module } from '@nestjs/common';
import { EmailsModule } from '../emails/emails.module';
import { PersonsModule } from '../persons/persons.module';
import { StoresModule } from '../stores/stores.module';
import { UsersModule } from '../users/users.module';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { OtpRepository } from './repositories/otp.repository';
import { OtpPasswordRepository } from './repositories/otp-forget-password.repository';

@Module({
  imports: [PersonsModule, StoresModule, EmailsModule, UsersModule],
  controllers: [OtpController],
  providers: [OtpService, OtpRepository, OtpPasswordRepository],
  exports: [OtpService, OtpRepository],
})
export class OtpModule {}
