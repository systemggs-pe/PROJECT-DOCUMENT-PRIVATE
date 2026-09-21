import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { parseOwnerProfileUpdate } from "./dto";

const GLOBAL_OWNER_PROFILE_ID = "global";

@Injectable()
export class OwnerProfileService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get() {
    return this.prisma.client.ownerProfile.upsert({
      where: { id: GLOBAL_OWNER_PROFILE_ID },
      update: {},
      create: { id: GLOBAL_OWNER_PROFILE_ID, fullName: "" },
    });
  }

  async update(actor: CurrentUser, body: unknown) {
    const input = parseOwnerProfileUpdate(body);
    const data = {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    } satisfies Prisma.OwnerProfileUpdateInput;

    return this.prisma.client.$transaction(async (tx) => {
      const ownerProfile = await tx.ownerProfile.upsert({
        where: { id: GLOBAL_OWNER_PROFILE_ID },
        update: data,
        create: createData(input),
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "UPDATE",
          entityType: "OWNER_PROFILE",
          metadata: { event: "OWNER_PROFILE_UPDATED", ownerProfileId: ownerProfile.id, fields: Object.keys(input) },
        },
      });
      return ownerProfile;
    });
  }
}

function createData(input: ReturnType<typeof parseOwnerProfileUpdate>): Prisma.OwnerProfileCreateInput {
  return {
    id: GLOBAL_OWNER_PROFILE_ID,
    fullName: input.fullName ?? "",
    email: input.email ?? null,
    phone: input.phone ?? null,
  };
}
