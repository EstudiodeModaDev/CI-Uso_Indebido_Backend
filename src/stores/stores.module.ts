import { Module } from "@nestjs/common";
import { StoresController } from "./stores.controller";
import { StoresRepository } from "./repositories/stores.repository";
import { StoresService } from "./stores.service";

@Module({
  controllers: [StoresController],
  providers: [
    StoresRepository,
    StoresService,
  ],
  exports: [
    StoresRepository,
    StoresService,
  ],
})
export class StoresModule {}