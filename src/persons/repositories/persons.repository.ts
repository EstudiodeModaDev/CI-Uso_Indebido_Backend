import {Inject, Injectable, InternalServerErrorException,} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../../database/database.constants";

export interface Person {
  id: string;
  documentType: string;
  document: string;
  nombre: string;
  email: string | null;
  phone: string | null;
  apellidos: string;
  status: "ACTIVO" | "INACTIVO";
}

interface PersonDatabaseRow {
  id: string;
  tipo_documento: string;
  documento: string;
  nombre_completo: string;
  correo: string | null;
  telefono: string | null;
  tipo_persona: "EMPLEADO" | "SOCIO";
  estado: "ACTIVO" | "INACTIVO";
  nombres: string
  apellidos: string,
  origen: string
}

@Injectable()
export class PersonsRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async findByDocument(document: string): Promise<Person | null> {
    const { data, error } = await this.supabase
      .from("PERSONAS")
      .select(`
        id,
        tipo_documento,
        numero_documento,
        nombres,
        apellidos,
        correo,
        telefono,
        tipo_persona,
        estado
      `)
      .eq("numero_documento", document)
      .maybeSingle<PersonDatabaseRow>();

    if (error) {
      console.error("Error consultando persona:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new InternalServerErrorException({
        code: "PERSON_LOOKUP_FAILED",
        message: "No fue posible consultar la persona.",
      });
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      documentType: data.tipo_documento,
      document: data.documento,
      apellidos: data.nombre_completo,
      email: data.correo,
      phone: data.telefono,
      nombre: data.apellidos,
      status: data.estado,
    };
  }
}