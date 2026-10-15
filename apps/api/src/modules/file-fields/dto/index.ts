import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

export const allowedFileFieldMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const mimeSchema = z.enum(allowedFileFieldMimeTypes);

const baseSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,59}$/).optional(),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  required: z.boolean().default(false),
  acceptedMimeTypes: z.array(mimeSchema).min(1).max(8),
  maxFiles: z.number().int().min(1).max(20).default(1),
  maxFileSize: z.number().int().min(1).max(3 * 1024 * 1024).default(3 * 1024 * 1024),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
}).strict();

const updateSchema = baseSchema.partial().strict();
const querySchema = z.object({
  search: z.string().trim().max(120).default(""),
  source: z.enum(["SYSTEM", "CUSTOM"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  type: z.enum(["IMAGE", "PDF", "DOCUMENT", "ANY"]).optional(),
}).strict();

export type FileFieldCreateInput = z.infer<typeof baseSchema>;
export type FileFieldUpdateInput = z.infer<typeof updateSchema>;
export type FileFieldQuery = z.infer<typeof querySchema>;

export function parseFileFieldCreate(value: unknown) {
  const parsed = baseSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join(" "));
  return parsed.data;
}

export function parseFileFieldUpdate(value: unknown) {
  const parsed = updateSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join(" "));
  return parsed.data;
}

export function parseFileFieldQuery(value: unknown) {
  const parsed = querySchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los filtros de campos de archivo no son validos.");
  return parsed.data;
}
