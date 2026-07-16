import type { AuditResult } from "./audit-entry.interface";

export interface AuditLog {
  id: number

  accion: string;

  usuario?: number | null;

  entidad?: string | null;

  resultado?: AuditResult;
}