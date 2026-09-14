import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const organizationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]).optional(),
  sortBy: z.enum(["name", "slug", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();

const organizationInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  documentNumber: z.string().trim().max(40).nullable().optional(),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
}).strict();

const organizationUpdateSchema = organizationInputSchema.partial().strict();

export type OrganizationQuery = z.infer<typeof organizationQuerySchema>;
export type OrganizationInput = z.infer<typeof organizationInputSchema>;
export type OrganizationUpdate = z.infer<typeof organizationUpdateSchema>;

export function parseOrganizationQuery(value: unknown): OrganizationQuery {
  const parsed = organizationQuerySchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los filtros de organizaciones no son validos.");
  return parsed.data;
}

export function parseOrganizationInput(value: unknown): OrganizationInput {
  const parsed = organizationInputSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos de la organizacion no son validos.");
  return parsed.data;
}

export function parseOrganizationUpdate(value: unknown): OrganizationUpdate {
  const parsed = organizationUpdateSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos de la organizacion no son validos.");
  return parsed.data;
}

