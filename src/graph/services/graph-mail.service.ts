import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import type { GraphSendMailPayload } from "../interfaces/graph-mail.interface";
import { GraphAuthService } from "./graph-auth.service";

export interface SendGraphMailInput {
  to: string[];
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
}

export interface SendGraphMailResult {
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
}

@Injectable()
export class GraphMailService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly graphAuthService: GraphAuthService,
  ) {}

  async send(
    input: SendGraphMailInput,
  ): Promise<SendGraphMailResult> {
    const sender =
      this.configService.getOrThrow<string>(
        "graph.sender",
      );

    const token =
      await this.graphAuthService.getAccessToken();

    const endpoint =
      "https://graph.microsoft.com/v1.0/users/" +
      `${encodeURIComponent(sender)}/sendMail`;

    const payload: GraphSendMailPayload = {
      message: {
        subject: input.subject,
        body: {
          contentType: "HTML",
          content: input.html,
        },
        toRecipients: this.mapRecipients(input.to),
        ccRecipients: this.mapRecipients(input.cc ?? []),
        bccRecipients: this.mapRecipients(
          input.bcc ?? [],
        ),
      },
      saveToSentItems: true,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          endpoint,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            timeout: 20_000,
            validateStatus: (status) =>
              status >= 200 && status < 300,
          },
        ),
      );

      return {
        success: true,
        statusCode: response.status,
      };
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        return {
          success: false,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Error desconocido enviando correo.",
        };
      }

      return this.mapAxiosError(error);
    }
  }

  private mapRecipients(
    addresses: string[],
  ): Array<{
    emailAddress: {
      address: string;
    };
  }> {
    return addresses.map((address) => ({
      emailAddress: {
        address: address.trim(),
      },
    }));
  }

  private mapAxiosError(
    error: AxiosError,
  ): SendGraphMailResult {
    const graphMessage =
      this.extractGraphErrorMessage(
        error.response?.data,
      );

    console.error(
      "Error enviando correo con Microsoft Graph:",
      {
        status: error.response?.status,
        message: graphMessage,
      },
    );

    return {
      success: false,
      statusCode: error.response?.status,
      errorMessage: graphMessage,
    };
  }

  private extractGraphErrorMessage(
    data: unknown,
  ): string {
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data
    ) {
      const graphError = (
        data as {
          error?: {
            code?: unknown;
            message?: unknown;
          };
        }
      ).error;

      const code =
        typeof graphError?.code === "string"
          ? graphError.code
          : "GRAPH_ERROR";

      const message =
        typeof graphError?.message === "string"
          ? graphError.message
          : "Microsoft Graph rechazó el envío.";

      return `${code}: ${message}`.slice(0, 1000);
    }

    return "Microsoft Graph rechazó el envío.";
  }
}