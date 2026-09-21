import { Body, Controller, Get, Inject, Patch } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import type { CurrentUser as CurrentUserType } from "../auth/types/current-user";
import { OwnerProfileService } from "./owner-profile.service";

@Controller(["owner-profile", "company"])
export class OwnerProfileController {
  constructor(@Inject(OwnerProfileService) private readonly ownerProfile: OwnerProfileService) {}

  @Get()
  @Permissions("owner.read")
  get() {
    return this.ownerProfile.get();
  }

  @Patch()
  @Permissions("owner.update")
  update(@CurrentUser() user: CurrentUserType, @Body() body: unknown) {
    return this.ownerProfile.update(user, body);
  }
}
