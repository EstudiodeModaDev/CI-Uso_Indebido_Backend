import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditRepository } from "./repositories/audit.repository";

@Global()
@Module({
  providers: [
    AuditService,
    AuditRepository,
  ],
  exports: [
    AuditService,
    AuditRepository,
  ],
})
export class AuditModule {}