import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const roleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  sortBy: z.enum(["name", "key", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
}).strict();

const roleInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,78}$/).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
  permissionIds: z.array(z.uuid()).max(80).default([]),
}).strict();

const roleUpdateSchema = roleInputSchema.partial().extend({
  permissionIds: z.array(z.uuid()).max(80).optional(),
}).strict();

export type RoleQuery = z.infer<typeof roleQuerySchema>;
export type RoleInput = z.infer<typeof roleInputSchema>;
export type RoleUpdate = z.infer<typeof roleUpdateSchema>;

export function parseRoleQuery(value: unknown): RoleQuery {
  const parsed = roleQuerySchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los filtros de roles no son validos.");
  return parsed.data;
}

export function parseRoleInput(value: unknown): RoleInput {
  const parsed = roleInputSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos del rol no son validos.");
  return parsed.data;
}

export function parseRoleUpdate(value: unknown): RoleUpdate {
  const parsed = roleUpdateSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos del rol no son validos.");
  return parsed.data;
}

