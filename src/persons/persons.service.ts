import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { CurrentUser } from "../common/types/current-user.type";
import { PersonResponseDto } from "./dto/person-response.dto";
import { PersonsRepository } from "./repositories/persons.repository";

@Injectable()
export class PersonsService {
  constructor(
    private readonly personsRepository: PersonsRepository,
    private readonly auditService: AuditService,
  ) {}

  async findActiveByDocument(
    document: string,
  ): Promise<PersonResponseDto> {
    const normalizedDocument = document.trim();

    const person =
      await this.personsRepository.findByDocument(
        normalizedDocument,
      );

    if (!person || person.status !== "ACTIVO") {
      throw new NotFoundException({
        code: "PERSON_NOT_FOUND",
        message:
          "No se encontró una persona activa con ese documento.",
      });
    }

    return {
      id: person.id,
      tipo_documento: person.documentType,
      numero_documento: person.document,
      nombres: person.nombre,
      correo: person.email ?? "",
      telefono: person.phone ?? "",
      apellidos: person.apellidos,
      estado: person.status,
      origen: ""
    };
  }

  async findIdByDocument(document: string): Promise<string | null> {
    const person = await this.personsRepository.findByDocument(
      document.trim(),
    );

    return person?.id ?? null;
  }

  async findManyByIds(
    ids: string[],
  ): Promise<Map<string, { document: string; fullName: string }>> {
    return this.personsRepository.findManyByIds(ids);
  }

  async findActiveByDocumentAndAudit(
    document: string,
    currentUser: CurrentUser,
  ): Promise<PersonResponseDto> {
    try {
      const person =
        await this.findActiveByDocument(document);

      await this.auditService.success(
        "PERSON_LOOKUP",
        {
          usuario: currentUser.id,
          entidad: "PERSON", 
        },
      );

      return person;
    } catch (error) {
      await this.auditService.failure(
        "PERSON_LOOKUP",
        {
          usuario: currentUser.id,
          entidad: "PERSON",
          resultado: "FALLIDO",
          mensaje: "Consulta de persona fallida.",
        },
      );

      throw error;
    }
  }

  private extractErrorCode(
    error: unknown,
  ): string {
    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error
    ) {
      const response = (
        error as {
          response?: {
            code?: string;
          };
        }
      ).response;

      return response?.code ?? "UNKNOWN_ERROR";
    }

    return "UNKNOWN_ERROR";
  }
}