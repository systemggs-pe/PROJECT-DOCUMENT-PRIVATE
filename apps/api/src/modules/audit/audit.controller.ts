import { Controller, Get, Inject, Query } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { AuditService } from "./audit.service";

@Controller("audit")
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @Permissions("audit.read")
  list(@CurrentUser() user: CurrentUserType, @Query() query: Record<string, unknown>) {
    return this.audit.list(user, query);
  }
}
