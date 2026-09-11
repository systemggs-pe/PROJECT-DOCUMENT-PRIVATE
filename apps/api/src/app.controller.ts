import { Controller, Get } from "@nestjs/common";

import type { HealthStatus } from "./types/health";

@Controller()
export class AppController {
  @Get("health")
  health(): HealthStatus {
    return {
      status: "ok",
      service: "ggs-document-studio-api",
    };
  }
}
