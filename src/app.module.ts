import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";

import configuration from "./config/configuration";
import { envValidationSchema } from "./config/env.validation";

import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { UsersModule } from "./users/users.module";

import { RolesGuard } from "./common/guards/roles.guard";
import { SupabaseAuthGuard } from "./common/guards/supabase-auth.guard";
import { PersonsModule } from './persons/persons.module';
import { StoresModule } from './stores/stores.module';
import { EmailsModule } from './emails/emails.module';
import { OtpModule } from './otp/otp.module';
import { AuditModule } from './audit/audit.module';
import { GraphModule } from './graph/graph.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),

    DatabaseModule,
    UsersModule,
    AuthModule,
    HealthModule,
    PersonsModule,
    StoresModule,
    EmailsModule,
    OtpModule,
    AuditModule,
    GraphModule,
  ],

  providers: [
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}