import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CurrentUser } from "../common/types/current-user.type";
import type { Store } from "./interfaces/store.interface";
import { StoresRepository } from "./repositories/stores.repository";

@Injectable()
export class StoresService {
  constructor(
    private readonly storesRepository: StoresRepository,
  ) {}

  async resolveCurrentStore(
    currentUser: CurrentUser,
  ): Promise<Store> {
    if (!currentUser.roles.includes("TIENDA")) {
      throw new ForbiddenException({
        code: "USER_IS_NOT_STORE",
        message: "El usuario autenticado no pertenece a una tienda.",
      });
    }

    const store = await this.storesRepository.findByEmail(
      currentUser.correo,
    );

    if (!store) {
      throw new NotFoundException({
        code: "STORE_NOT_FOUND",
        message:
          "No se encontró una tienda asociada al usuario autenticado.",
      });
    }

    if (!store.status) {
      throw new ForbiddenException({
        code: "STORE_INACTIVE",
        message: "La tienda se encuentra inactiva.",
      });
    }

    return store;
  }

  async findNamesByIds(
    ids: number[],
  ): Promise<Map<number, string>> {
    const uniqueIds = [...new Set(ids)];

    return this.storesRepository.findNamesByIds(
      uniqueIds,
    );
  }

  async listAll(): Promise<Store[]> {
    return this.storesRepository.findAll();
  }
}
