import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { FileFieldsService } from "./file-fields.service";

@Controller("file-fields")
export class FileFieldsController {
  constructor(@Inject(FileFieldsService) private readonly fileFields: FileFieldsService) {}

  @Get()
  @Permissions("file_fields.read")
  list(@Query() query: Record<string, unknown>) {
    return this.fileFields.list(query);
  }

  @Post()
  @Permissions("file_fields.create")
  create(@Body() body: unknown, @CurrentUser() user: CurrentUserType) {
    return this.fileFields.create(user, body);
  }

  @Patch(":id")
  @Permissions("file_fields.update")
  update(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown, @CurrentUser() user: CurrentUserType) {
    return this.fileFields.update(user, id, body);
  }

  @Delete(":id")
  @Permissions("file_fields.delete")
  remove(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.fileFields.remove(user, id);
  }
}
