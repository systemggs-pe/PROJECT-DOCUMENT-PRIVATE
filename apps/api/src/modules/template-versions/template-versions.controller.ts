import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { TemplateVersionsService } from "./template-versions.service";

@Controller("templates/:templateId/versions")
export class TemplateVersionsController {
  constructor(@Inject(TemplateVersionsService) private readonly versions: TemplateVersionsService) {}

  @Get()
  @Permissions("template_versions.read")
  list(@Param("templateId", new ParseUUIDPipe()) templateId: string, @CurrentUser() user: CurrentUserType) {
    return this.versions.listOwned(templateId, user);
  }

  @Post()
  @Permissions("template_versions.create")
  create(@Param("templateId", new ParseUUIDPipe()) templateId: string, @Body() body: unknown, @CurrentUser() user: CurrentUserType) {
    return this.versions.create(templateId, user, body);
  }

  @Get(":versionId")
  @Permissions("template_versions.read")
  findOne(@Param("templateId", new ParseUUIDPipe()) templateId: string, @Param("versionId", new ParseUUIDPipe()) versionId: string, @CurrentUser() user: CurrentUserType) {
    return this.versions.findOwned(templateId, versionId, user);
  }

  @Put(":versionId")
  @Permissions("template_versions.update")
  update(@Param("templateId", new ParseUUIDPipe()) templateId: string, @Param("versionId", new ParseUUIDPipe()) versionId: string, @Body() body: unknown, @CurrentUser() user: CurrentUserType) {
    return this.versions.update(templateId, versionId, user, body);
  }

  @Post(":versionId/activate")
  @Permissions("template_versions.update")
  @HttpCode(HttpStatus.OK)
  activate(@Param("templateId", new ParseUUIDPipe()) templateId: string, @Param("versionId", new ParseUUIDPipe()) versionId: string, @CurrentUser() user: CurrentUserType) {
    return this.versions.activate(templateId, versionId, user);
  }

  @Post(":versionId/duplicate")
  @Permissions("template_versions.create")
  duplicate(@Param("templateId", new ParseUUIDPipe()) templateId: string, @Param("versionId", new ParseUUIDPipe()) versionId: string, @CurrentUser() user: CurrentUserType) {
    return this.versions.duplicate(templateId, versionId, user);
  }
}
