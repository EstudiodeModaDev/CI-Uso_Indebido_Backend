export type AuditResult =
  | "EXITOSO"
  | "FALLIDO"
  | "ADVERTENCIA";

export interface AuditEntry {
  accion: string;

  usuario?: number | null;

  entidad?: string | null;

  resultado?: AuditResult;
    mensaje?: string | null
}