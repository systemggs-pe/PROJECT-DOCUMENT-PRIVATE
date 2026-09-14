import { Controller, Get } from "@nestjs/common";

import { CurrentUser } from "./decorators/current-user.decorator";
import type { CurrentUser as CurrentUserType } from "./types/current-user";

@Controller("auth")
export class AuthController {
  @Get("me")
  getMe(@CurrentUser() user: CurrentUserType): CurrentUserType {
    return user;
  }
}
