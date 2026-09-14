import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @Permissions("users.read")
  list(@CurrentUser() user: CurrentUserType, @Query() query: Record<string, unknown>) {
    return this.users.list(user, query);
  }

  @Post()
  @Permissions("users.create")
  create(@CurrentUser() user: CurrentUserType, @Body() body: unknown) {
    return this.users.create(user, body);
  }

  @Get(":id")
  @Permissions("users.read")
  findOne(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.users.findOne(user, id);
  }

  @Patch(":id")
  @Permissions("users.update")
  update(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    return this.users.update(user, id, body);
  }

  @Post(":id/activate")
  @Permissions("users.deactivate")
  activate(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.users.activate(user, id);
  }

  @Post(":id/deactivate")
  @Permissions("users.deactivate")
  deactivate(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.users.deactivate(user, id);
  }

  @Post(":id/roles")
  @Permissions("users.update", "permissions.assign")
  replaceRoles(@CurrentUser() user: CurrentUserType, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    return this.users.replaceRoles(user, id, body);
  }
}
