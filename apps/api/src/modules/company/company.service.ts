import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/database/prisma.service";
import type { CurrentUser } from "../auth/types/current-user";
import { parseCompanyUpdate } from "./dto";

const GLOBAL_COMPANY_ID = "global";
const DEFAULT_COMPANY_NAME = "Empresa";
const DEFAULT_COUNTRY = "Peru";

@Injectable()
export class CompanyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get() {
    const company = await this.prisma.client.companySettings.upsert({
      where: { id: GLOBAL_COMPANY_ID },
      update: {},
      create: { id: GLOBAL_COMPANY_ID, name: DEFAULT_COMPANY_NAME, country: DEFAULT_COUNTRY },
      include: companyInclude,
    });
    return serializeCompany(company);
  }

  async update(actor: CurrentUser, body: unknown) {
    const input = parseCompanyUpdate(body);
    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tradeName !== undefined ? { tradeName: input.tradeName } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.documentNumber !== undefined ? { documentNumber: input.documentNumber } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.region !== undefined ? { region: input.region } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.logoFileId !== undefined ? { logoFile: input.logoFileId ? { connect: { id: input.logoFileId } } : { disconnect: true } } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.slogan !== undefined ? { slogan: input.slogan } : {}),
      ...(input.footerText !== undefined ? { footerText: input.footerText } : {}),
    } satisfies Prisma.CompanySettingsUpdateInput;

    return this.prisma.client.$transaction(async (tx) => {
      if (input.logoFileId) {
        const logo = await tx.storedFile.findFirst({ where: { id: input.logoFileId, type: "IMAGE" }, select: { id: true } });
        if (!logo) throw new NotFoundException("Logo no encontrado o no es una imagen valida.");
      }
      const company = await tx.companySettings.upsert({
        where: { id: GLOBAL_COMPANY_ID },
        update: data,
        create: createData(input),
        include: companyInclude,
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "UPDATE",
          entityType: "COMPANY_SETTINGS",
          entityId: company.id,
          metadata: { event: input.logoFileId !== undefined || input.logoUrl !== undefined ? "COMPANY_LOGO_UPDATED" : "COMPANY_SETTINGS_UPDATED", fields: Object.keys(input) },
        },
      });
      return serializeCompany(company);
    });
  }
}

const companyInclude = {
  logoFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, width: true, height: true } },
} as const;

function createData(input: ReturnType<typeof parseCompanyUpdate>): Prisma.CompanySettingsCreateInput {
  if (input.logoFileId) {
    return {
      ...baseCreateData(input),
      logoFile: { connect: { id: input.logoFileId } },
    };
  }
  return baseCreateData(input);
}

function baseCreateData(input: ReturnType<typeof parseCompanyUpdate>): Prisma.CompanySettingsCreateInput {
  return {
    id: GLOBAL_COMPANY_ID,
    name: input.name ?? DEFAULT_COMPANY_NAME,
    tradeName: input.tradeName ?? null,
    legalName: input.legalName ?? null,
    documentNumber: input.documentNumber ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    region: input.region ?? null,
    country: input.country ?? DEFAULT_COUNTRY,
    logoUrl: input.logoUrl ?? null,
    description: input.description ?? null,
    slogan: input.slogan ?? null,
    footerText: input.footerText ?? null,
  };
}

function serializeCompany<T extends { logoFile: { sizeBytes: bigint } | null }>(company: T) {
  return {
    ...company,
    displayName: "tradeName" in company && typeof company.tradeName === "string" && company.tradeName ? company.tradeName : "name" in company ? company.name : DEFAULT_COMPANY_NAME,
    logoFile: company.logoFile ? { ...company.logoFile, sizeBytes: company.logoFile.sizeBytes.toString() } : null,
  };
}
