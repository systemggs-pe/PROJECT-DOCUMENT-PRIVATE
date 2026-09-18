import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const companyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  legalName: z.string().trim().max(180).nullable().optional(),
  documentNumber: z.string().trim().max(60).nullable().optional(),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  logoUrl: z.url().max(500).nullable().optional(),
}).strict();

export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;

export function parseCompanyUpdate(value: unknown): CompanyUpdateInput {
  const parsed = companyUpdateSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos de la empresa no son validos.");
  return parsed.data;
}
