import { Module } from "@nestjs/common";
import { PersonsController } from "./persons.controller";
import { PersonsService } from "./persons.service";
import { PersonsRepository } from "./repositories/persons.repository";

@Module({
  controllers: [PersonsController],
  providers: [
    PersonsService,
    PersonsRepository,
  ],
  exports: [
    PersonsService,
    PersonsRepository,
  ],
})
export class PersonsModule {}