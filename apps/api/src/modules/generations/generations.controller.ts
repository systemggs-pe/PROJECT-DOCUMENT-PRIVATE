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

  @Post("preview")
  @Permissions("generations.create")
  async preview(@Body() body: unknown, @CurrentUser() user: CurrentUserType, @Res() response: Response) {
    const content = await this.runner.preview(user, body);
    response.set({
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline; filename=\"preview.pdf\"",
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    });
    response.send(content);
  }

  @Get()
  @Permissions("generations.read")
  list(@Query() query: unknown, @CurrentUser() user: CurrentUserType) {
    return this.generationsService.listOwned(user, query);
  }

  @Get(":id/download")
  @Permissions("generations.download")
  async download(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserType, @Res() response: Response) {
    const { url } = await this.generationsService.signedUrlOwned(id, user);
    response.set({ "Cache-Control": "private, no-store" }).redirect(302, url);
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
