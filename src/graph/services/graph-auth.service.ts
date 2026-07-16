import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import type { GraphTokenResponse } from "../interfaces/graph-token-response.interface";

@Injectable()
export class GraphAuthService {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenRequest: Promise<string> | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getAccessToken(): Promise<string> {
    const refreshMarginMilliseconds = 5 * 60 * 1000;

    const tokenIsStillValid =
      this.cachedToken !== null &&
      Date.now() <
        this.tokenExpiresAt - refreshMarginMilliseconds;

    if (tokenIsStillValid) {
      return this.cachedToken!;
    }

    /*
     * Evita pedir varios tokens simultáneamente cuando llegan
     * múltiples solicitudes al mismo tiempo.
     */
    if (this.tokenRequest) {
      return this.tokenRequest;
    }

    this.tokenRequest = this.requestAccessToken();

    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = null;
    }
  }

  private async requestAccessToken(): Promise<string> {
    const tenantId =
      this.configService.getOrThrow<string>(
        "graph.tenantId",
      );

    const clientId =
      this.configService.getOrThrow<string>(
        "graph.clientId",
      );

    const clientSecret =
      this.configService.getOrThrow<string>(
        "graph.clientSecret",
      );

    const tokenUrl =
      `https://login.microsoftonline.com/` +
      `${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post<GraphTokenResponse>(
          tokenUrl,
          body.toString(),
          {
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
            },
            timeout: 15_000,
          },
        ),
      );

      const token = response.data.access_token;
      const expiresIn = response.data.expires_in;

      if (!token || !expiresIn) {
        throw new InternalServerErrorException({
          code: "GRAPH_TOKEN_INVALID_RESPONSE",
          message:
            "Azure respondió sin un token válido.",
        });
      }

      this.cachedToken = token;
      this.tokenExpiresAt =
        Date.now() + expiresIn * 1000;

      return token;
    } catch (error) {
      this.cachedToken = null;
      this.tokenExpiresAt = 0;

      if (axios.isAxiosError(error)) {
        this.logTokenError(error);

        throw new UnauthorizedException({
          code: "GRAPH_AUTH_FAILED",
          message:
            "No fue posible autenticar la aplicación con Microsoft Graph.",
        });
      }

      throw error;
    }
  }

  private logTokenError(
    error: AxiosError,
  ): void {
    console.error(
      "Error obteniendo token de Microsoft Graph:",
      {
        status: error.response?.status,
        /*
         * No imprimimos headers ni configuración porque
         * podrían incluir información sensible.
         */
        response:
          this.extractSafeErrorMessage(
            error.response?.data,
          ),
      },
    );
  }

  private extractSafeErrorMessage(
    data: unknown,
  ): string {
    if (
      typeof data === "object" &&
      data !== null &&
      "error_description" in data &&
      typeof (
        data as { error_description?: unknown }
      ).error_description === "string"
    ) {
      return (
        data as { error_description: string }
      ).error_description.slice(0, 500);
    }

    return "Respuesta de autenticación no disponible.";
  }
}