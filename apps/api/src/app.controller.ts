import { Controller, Get, Inject } from "@nestjs/common";

import { PrismaService } from "./common/database/prisma.service";
import { Public } from "./modules/auth/decorators/public.decorator";
import type { HealthStatus } from "./types/health";

@Controller()
export class AppController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Get("health")
  async health(): Promise<HealthStatus> {
    const database = await this.prisma.checkHealth();

    return {
      status: database === "unreachable" ? "degraded" : "ok",
      service: "ggs-document-studio-api",
      database,
    };
  }
}
