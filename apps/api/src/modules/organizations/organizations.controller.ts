import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { OrganizationsService } from "./organizations.service";

@Controller()
export class OrganizationsController {
  constructor(@Inject(OrganizationsService) private readonly organizations: OrganizationsService) {}

  @Get("organizations")
  @Permissions("organizations.read")
  list(@CurrentUser() user: CurrentUserType, @Query() query: Record<string, unknown>) {
    return this.organizations.list(user, query);
  }

  @Post("organizations")
  @Permissions("organizations.create")
  create(@CurrentUser() user: CurrentUserType, @Body() body: unknown) {
    return this.organizations.create(user, body);
  }

  @Get("organization")
  @Permissions("organizations.read")
  current(@CurrentUser() user: CurrentUserType) {
    return this.organizations.current(user);
  }

  @Get("organizations/:id")
  @Permissions("organizations.read")
  findOne(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.organizations.findOne(user, id);
  }

  @Patch("organizations/:id")
  @Permissions("organizations.update")
  update(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    return this.organizations.update(user, id, body);
  }

  @Post("organizations/:id/suspend")
  @Permissions("organizations.suspend")
  suspend(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.organizations.suspend(user, id);
  }

  @Post("organizations/:id/activate")
  @Permissions("organizations.suspend")
  activate(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.organizations.activate(user, id);
  }
}

