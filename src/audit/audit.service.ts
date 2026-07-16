import { Injectable } from "@nestjs/common";
import type { AuditEntry } from "./interfaces/audit-entry.interface";
import { AuditRepository } from "./repositories/audit.repository";

@Injectable()
export class AuditService {
  constructor(
    private readonly auditRepository: AuditRepository,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.auditRepository.record(
      this.sanitizeEntry(entry),
    );
  }

  async success(
    action: string,
    entry: Omit<
      AuditEntry,
      "accion" | "resultado"
    > = {},
  ): Promise<void> {
    await this.log({
      ...entry,
      accion:action,
      resultado: "EXITOSO",
    });
  }

  async failure(
    action: string,
    entry: Omit<
      AuditEntry,
      "accion" | "result"
    > = {},
  ): Promise<void> {
    await this.log({
      ...entry,
      accion: action,
      resultado: "FALLIDO",
    });
  }

  async warning(
    action: string,
    entry: Omit<
      AuditEntry,
      "accion" | "result"
    > = {},
  ): Promise<void> {
    await this.log({
      ...entry,
      accion: action,
      resultado: "ADVERTENCIA",
    });
  }

  private sanitizeEntry(
    entry: AuditEntry,
  ): AuditEntry {
    return {
      ...entry,
    };
  }

  private sanitizeMetadata(
    metadata?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!metadata) {
      return null;
    }

    const forbiddenKeys = [
      "code",
      "otp",
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "authorization",
      "secret",
      "serviceRoleKey",
    ];

    return Object.fromEntries(
      Object.entries(metadata).filter(
        ([key]) =>
          !forbiddenKeys.some(
            (forbiddenKey) =>
              key.toLowerCase() ===
              forbiddenKey.toLowerCase(),
          ),
      ),
    );
  }
}