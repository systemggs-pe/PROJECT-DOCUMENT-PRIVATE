import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { RolesService } from "./roles.service";

@Controller()
export class RolesController {
  constructor(@Inject(RolesService) private readonly roles: RolesService) {}

  @Get("roles")
  @Permissions("roles.read")
  list(@CurrentUser() user: CurrentUserType, @Query() query: Record<string, unknown>) {
    return this.roles.list(user, query);
  }

  @Post("roles")
  @Permissions("roles.create")
  create(@CurrentUser() user: CurrentUserType, @Body() body: unknown) {
    return this.roles.create(user, body);
  }

  @Get("roles/:id")
  @Permissions("roles.read")
  findOne(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.roles.findOne(user, id);
  }

  @Patch("roles/:id")
  @Permissions("roles.update", "permissions.assign")
  update(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    return this.roles.update(user, id, body);
  }

  @Delete("roles/:id")
  @Permissions("roles.delete")
  remove(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.roles.remove(user, id);
  }

  @Get("permissions")
  @Permissions("permissions.read")
  permissions() {
    return this.roles.permissions();
  }
}
