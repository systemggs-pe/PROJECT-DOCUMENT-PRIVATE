import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";
import type { Request } from "express";

import type { AuthenticatedRequest, CurrentUser as CurrentUserType } from "../types/current-user";

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): CurrentUserType => {
  const request = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();

  if (!request.user) {
    throw new Error("Current user is not available on this request");
  }

  return request.user;
});
