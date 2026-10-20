import { Controller, Get, Query } from '@nestjs/common';
import { InvoiceService } from './invoice.service';

@Controller('invoice')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  getInvoice(
    @Query('cedula') cedula: string,
    @Query('factura') factura: string,
  ) {
    return this.invoiceService.getInvoice(cedula, factura);
  }
}
