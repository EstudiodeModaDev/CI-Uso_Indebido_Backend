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

  async findManyByIds(
    ids: string[],
  ): Promise<Map<string, { document: string; fullName: string }>> {
    if (ids.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from("PERSONAS")
      .select(`
        id,
        numero_documento,
        nombres,
        apellidos
      `)
      .in("id", ids);

    if (error) {
      console.error("Error consultando personas:", {
        message: error.message,
        code: error.code,
        details: error.details,
      });

      throw new InternalServerErrorException({
        code: "PERSONS_LOOKUP_FAILED",
        message: "No fue posible consultar las personas.",
      });
    }

    return new Map(
      (data ?? []).map((person) => [
        person.id as string,
        {
          document: person.numero_documento as string,
          fullName: `${person.nombres as string} ${person.apellidos as string}`.trim(),
        },
      ]),
    );
  }
}