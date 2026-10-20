import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 20_000,
    }),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService],
})
export class InvoiceModule {}
