import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { FilesService } from "./files.service";

@Controller("files")
export class FilesController {
  constructor(@Inject(FilesService) private readonly filesService: FilesService) {}

  @Post()
  @Permissions("files.upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 3, fieldSize: 1024, parts: 5 } }))
  upload(@UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string } | undefined, @Body() body: Record<string, unknown>, @CurrentUser() user: CurrentUserType) {
    return this.filesService.upload(user, file, body);
  }

  @Get(":id/download")
  @Permissions("files.read")
  async download(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType, @Res() res: Response) {
    const { url } = await this.filesService.signedUrl(id, user);
    res.set({ "Cache-Control": "private, no-store" }).redirect(302, url);
  }

  @Get(":id/signed-url")
  @Permissions("files.read")
  sign(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.filesService.signedUrl(id, user);
  }

  @Delete(":id")
  @Permissions("files.delete")
  remove(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.filesService.removeUnused(id, user);
  }

  @Get()
  @Permissions("files.read")
  list(@Query() query: Record<string, unknown>, @CurrentUser() user: CurrentUserType) {
    return this.filesService.listOwned(user, query);
  }

  @Get(":id")
  @Permissions("files.read")
  findOne(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.filesService.findOwnedOrThrow(id, user);
  }
}
