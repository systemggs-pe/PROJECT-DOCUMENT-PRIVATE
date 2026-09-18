import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  role: z.string().trim().max(80).optional(),
  sortBy: z.enum(["createdAt", "email", "name", "lastLoginAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();

const createUserSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120).optional(),
  avatarUrl: z.url().max(500).optional(),
  isActive: z.boolean().default(true),
  roleIds: z.array(z.uuid()).max(10).default([]),
}).strict();

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).nullable().optional(),
  avatarUrl: z.url().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

const roleAssignmentSchema = z.object({
  roleIds: z.array(z.uuid()).min(1).max(10),
}).strict();

export type UserQuery = z.infer<typeof userQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;

export function parseUserQuery(value: unknown): UserQuery {
  const parsed = userQuerySchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los filtros de usuarios no son validos.");
  return parsed.data;
}

export function parseCreateUser(value: unknown): CreateUserInput {
  const parsed = createUserSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos del usuario no son validos.");
  return parsed.data;
}

export function parseUpdateUser(value: unknown): UpdateUserInput {
  const parsed = updateUserSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos del usuario no son validos.");
  return parsed.data;
}

export function parseRoleAssignment(value: unknown): RoleAssignmentInput {
  const parsed = roleAssignmentSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("La asignacion de roles no es valida.");
  return parsed.data;
}
