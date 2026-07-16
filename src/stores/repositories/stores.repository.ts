import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../../database/database.constants";
import type { Store } from "../interfaces/store.interface";

interface StoreDatabaseRow {
  id: string;
  nombre: string;
  codigo: string | null;
  correo: string;
  activo: "ACTIVA" | "INACTIVA";
}

@Injectable()
export class StoresRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async findByEmail(email: string): Promise<Store | null> {
    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await this.supabase
      .from("TIENDAS")
      .select(`
        id,
        nombre,
        correo,
        ciudad,
        activo
      `)
      .ilike("correo", normalizedEmail)
      .maybeSingle<StoreDatabaseRow>();

    if (error) {
      console.error("Error consultando la tienda:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: "STORE_LOOKUP_FAILED",
        message: "No fue posible consultar la tienda.",
      });
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      name: data.nombre,
      code: data.codigo,
      email: data.correo,
      status: data.activo,
    };
  }
}