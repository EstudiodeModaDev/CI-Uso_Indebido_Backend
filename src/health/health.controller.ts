import {Controller, Get, ServiceUnavailableException,} from "@nestjs/common";
import { HealthService } from "./health.service";
import { Public } from "../common/decorators/public.decorator";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  async check() {
    const result = await this.healthService.check();

    if (result.status === "degraded") {
      throw new ServiceUnavailableException({
        code: "SERVICE_UNAVAILABLE",
        message: "No fue posible conectar con la base de datos.",
        ...result,
      });
    }

    return result;
  }
}