import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const companyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  tradeName: z.string().trim().max(160).nullable().optional(),
  legalName: z.string().trim().max(180).nullable().optional(),
  documentNumber: z.string().trim().regex(/^[A-Za-z0-9 ._-]{1,30}$/).nullable().optional(),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().trim().regex(/^[0-9+() .-]{1,40}$/).nullable().optional(),
  website: z.url().max(500).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().min(2).max(120).nullable().optional(),
  logoUrl: z.url().max(500).nullable().optional(),
  logoFileId: z.uuid().nullable().optional(),
  description: z.string().trim().max(1200).nullable().optional(),
  slogan: z.string().trim().max(180).nullable().optional(),
  footerText: z.string().trim().max(500).nullable().optional(),
}).strict();

export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;

export function parseCompanyUpdate(value: unknown): CompanyUpdateInput {
  const parsed = companyUpdateSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos de la empresa no son validos.");
  return parsed.data;
}
