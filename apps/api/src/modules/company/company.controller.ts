import { Body, Controller, Get, Inject, Patch } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { CompanyService } from "./company.service";

@Controller("company")
export class CompanyController {
  constructor(@Inject(CompanyService) private readonly company: CompanyService) {}

  @Get()
  @Permissions("company.read")
  get() {
    return this.company.get();
  }

  @Patch()
  @Permissions("company.update")
  update(@CurrentUser() user: CurrentUserType, @Body() body: unknown) {
    return this.company.update(user, body);
  }
}
