import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { invoice } from './interfaces/invoice.interface';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import axios from 'axios';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async getInvoice(
    cedula: string,
    factura: string,
  ): Promise<{
    data: invoice | null;
    ok: boolean;
    errorMessage?: string;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<invoice>(
          `${this.configService.getOrThrow<string>('INVOICE_API_URL')}&parametros=NumFacturaTexto=${factura}|Cedula=${cedula}`,
          {
            headers: {
              ConniKey: this.configService.getOrThrow<string>('CONNIKEY'),
              ConniToken: this.configService.getOrThrow<string>('CONNITOKEN'),
            },
            timeout: 20_000,
            validateStatus: (status) => status >= 200 && status < 300,
          },
        ),
      );

      return {
        data: response.data,
        ok: true,
      };
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        return {
          data: null,
          ok: false,
          errorMessage:
            error instanceof Error ? error.message : 'Error desconocido.',
        };
      }

      console.error('Error consultando factura:', {
        status: error.response?.status,
        message: error.message,
      });

      return {
        data: null,
        ok: false,
        errorMessage: error.message,
      };
    }
  }
}
