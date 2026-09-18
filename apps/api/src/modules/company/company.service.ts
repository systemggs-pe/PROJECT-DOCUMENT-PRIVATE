import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { parseCompanyUpdate } from "./dto";

const GLOBAL_COMPANY_ID = "global";
const DEFAULT_COMPANY_NAME = "GGS Document Studio";

@Injectable()
export class CompanyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get() {
    return this.prisma.client.companySettings.upsert({
      where: { id: GLOBAL_COMPANY_ID },
      update: {},
      create: { id: GLOBAL_COMPANY_ID, name: DEFAULT_COMPANY_NAME },
    });
  }

  async update(actor: CurrentUser, body: unknown) {
    const input = parseCompanyUpdate(body);
    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.documentNumber !== undefined ? { documentNumber: input.documentNumber } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
    } satisfies Prisma.CompanySettingsUpdateInput;

    return this.prisma.client.$transaction(async (tx) => {
      const company = await tx.companySettings.upsert({
        where: { id: GLOBAL_COMPANY_ID },
        update: data,
        create: { id: GLOBAL_COMPANY_ID, ...data, name: input.name ?? DEFAULT_COMPANY_NAME },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "UPDATE",
          entityType: "COMPANY_SETTINGS",
          entityId: company.id,
          metadata: { event: "COMPANY_SETTINGS_UPDATED", fields: Object.keys(input) },
        },
      });
      return company;
    });
  }
}
