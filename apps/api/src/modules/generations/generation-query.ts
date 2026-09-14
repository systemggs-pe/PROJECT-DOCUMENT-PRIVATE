import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe usar YYYY-MM-DD.").refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "La fecha no es valida.");

const schema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(""),
  status: z.enum(["COMPLETED", "PROCESSING", "FAILED", "PENDING"]).optional(),
  templateId: z.string().uuid().optional(),
  templateVersionId: z.string().uuid().optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
  sort: z.enum(["createdAt", "number"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
}).strict().superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: "custom", path: ["to"], message: "La fecha final debe ser posterior a la fecha inicial." });
});

export type GenerationQuery = z.infer<typeof schema>;

export function parseGenerationQuery(value: unknown): GenerationQuery {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException("Los filtros del historial no son validos.");
  return result.data;
}

export function startOfDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function endOfDayExclusive(value: string) {
  const date = startOfDay(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
