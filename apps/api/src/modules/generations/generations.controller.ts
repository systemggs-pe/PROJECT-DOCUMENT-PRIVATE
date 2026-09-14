import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { GenerationRunnerService } from "./generation-runner.service";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { GenerationsService } from "./generations.service";

@Controller("generations")
export class GenerationsController {
  constructor(@Inject(GenerationsService) private readonly generationsService: GenerationsService, @Inject(GenerationRunnerService) private readonly runner: GenerationRunnerService) {}

  @Post()
  @Permissions("generations.create")
  generate(@Body() body: unknown, @CurrentUser() user: CurrentUserType) {
    return this.runner.generate(user, body);
  }

  @Get()
  @Permissions("generations.read")
  list(@Query() query: unknown, @CurrentUser() user: CurrentUserType) {
    return this.generationsService.listOwned(user, query);
  }

  @Get(":id/download")
  @Permissions("generations.download")
  async download(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType, @Res() response: Response) {
    const result = await this.generationsService.downloadOwned(id, user);
    response.set({
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${result.generation.number}.pdf"`,
      "Content-Type": result.file.mimeType,
      "X-Content-Type-Options": "nosniff",
    });
    response.send(result.content);
  }

  @Get(":id/signed-url")
  @Permissions("generations.download")
  signedUrl(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.generationsService.signedUrlOwned(id, user);
  }

  @Get(":id")
  @Permissions("generations.read")
  findOne(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.generationsService.findOwnedOrThrow(id, user);
  }

  @Delete(":id")
  @Permissions("generations.delete")
  remove(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType) {
    return this.generationsService.removeOwned(id, user);
  }
}
