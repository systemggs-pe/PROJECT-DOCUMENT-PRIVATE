import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { TemplatesService } from "./templates.service";

@Controller("templates")
export class TemplatesController {
  constructor(@Inject(TemplatesService) private readonly templatesService: TemplatesService) {}

  @Post()
  @Permissions("templates.create", "template_versions.create")
  create(@Body() body: unknown, @CurrentUser() user: CurrentUserType) {
    return this.templatesService.create(user, body);
  }

  @Patch(":id")
  @Permissions("templates.update")
  updateMetadata(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown, @CurrentUser() user: CurrentUserType) {
    return this.templatesService.updateMetadata(id, user, body);
  }

  @Put(":id")
  @Permissions("templates.update", "template_versions.create")
  save(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown, @CurrentUser() user: CurrentUserType) {
    return this.templatesService.save(user, body, id);
  }

  @Post(":id/archive")
  @Permissions("templates.delete")
  @HttpCode(HttpStatus.OK)
  archive(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.templatesService.archive(id, user);
  }

  @Post(":id/restore")
  @Permissions("templates.update")
  @HttpCode(HttpStatus.OK)
  restore(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.templatesService.restore(id, user);
  }

  @Get()
  @Permissions("templates.read")
  list(@Query() query: Record<string, string | undefined>, @CurrentUser() user: CurrentUserType) {
    return this.templatesService.listOwned(user, query);
  }

  @Get(":id")
  @Permissions("templates.read")
  findOne(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.templatesService.findOwnedOrThrow(id, user);
  }
}
