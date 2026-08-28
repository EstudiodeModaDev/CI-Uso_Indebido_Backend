export type OtpStatus =
  | "PENDIENTE"
  | "REDIMIDO"
  | "EXPIRADO"
  | "ANULADO"
  | "BLOQUEADO";

export interface OtpRecord {
  id: string;
  persona_id: string;
  tienda_generacion_id: number;
  tienda_redencion_id: number | null;
  codigo_hash: string;
  codigo_encriptado: string | null;
  estado: OtpStatus;
  fecha_generacion: Date;
  fecha_expiracion: Date;
  fecha_validacion: Date | null;
  fecha_redencion: Date | null;
  valor_compra: number;
  intentos_validacion: number;
  invoice_number: number | null;
}
