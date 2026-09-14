import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const element = z.object({
  id: z.string().uuid(), type: z.enum(["IMAGE", "TEXT", "RECTANGLE", "LINE"]),
  name: z.string().trim().min(1).max(120), key: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/).nullable(),
  page: z.number().int().min(1).max(20), x: z.number().min(0).max(2000), y: z.number().min(0).max(2000),
  width: z.number().positive().max(2000), height: z.number().positive().max(2000),
  rotation: z.number().min(-180).max(180), zIndex: z.number().int().min(0).max(1000), required: z.boolean(),
  properties: z.object({
    fitMode: z.enum(["contain", "cover", "fill", "stretch"]).default("contain"),
    border: z.boolean().default(false), borderWidth: z.number().min(0).max(10).default(1),
    borderRadius: z.number().min(0).max(100).default(0),
    text: z.string().max(2000).default(""), fontSize: z.number().min(6).max(100).default(12),
    fontFamily: z.string().trim().min(1).max(80).default("Inter"),
    fontWeight: z.enum(["400", "500", "600", "700"]).default("400"),
    textAlign: z.enum(["left", "center", "right"]).default("left"),
    color: color.default("#17211c"), fill: color.default("#eef2f4"), stroke: color.default("#63716a"),
    strokeWidth: z.number().min(0).max(10).default(1),
  }).strict(),
}).strict();

const versionShape = {
  paperSize: z.enum(["A4", "A5", "LETTER", "LEGAL", "CUSTOM"]), orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  width: z.number().min(100).max(2000), height: z.number().min(100).max(2000),
  marginTop: z.number().min(0), marginRight: z.number().min(0), marginBottom: z.number().min(0), marginLeft: z.number().min(0),
  pageCount: z.number().int().min(1).max(20), elements: z.array(element).max(100),
};

function validateVersion(value: { marginLeft: number; marginRight: number; marginTop: number; marginBottom: number; width: number; height: number; pageCount: number; elements: Array<z.infer<typeof element>> }, ctx: z.RefinementCtx) {
  const error = (message: string) => ctx.addIssue({ code: "custom", message });
  if (value.marginLeft + value.marginRight >= value.width || value.marginTop + value.marginBottom >= value.height) error("Los margenes no caben en la pagina.");
  const ids = new Set<string>(); const keys = new Set<string>();
  for (const item of value.elements) {
    if (ids.has(item.id)) error("Los elementos deben tener identificadores unicos.");
    ids.add(item.id);
    if (item.page > value.pageCount || item.x + item.width > value.width + 0.01 || item.y + item.height > value.height + 0.01) error(`El elemento ${item.name} esta fuera de la pagina.`);
    if (item.type === "IMAGE" && !item.key) error("Cada imagen necesita una clave.");
    if (item.type !== "IMAGE" && item.key) error("Solo los campos de imagen pueden tener clave.");
    if (item.key && keys.has(item.key)) error("Las claves de imagen no pueden repetirse.");
    if (item.key) keys.add(item.key);
  }
}

export const templateVersionInputSchema = z.object(versionShape).strict().superRefine(validateVersion);
export const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().max(1000).default(""),
  ...versionShape,
  expectedVersion: z.number().int().min(1).optional(),
}).strict().superRefine(validateVersion);
export const templateMetadataSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(""),
}).strict();

export type TemplateInput = z.infer<typeof templateInputSchema>;
export type TemplateMetadataInput = z.infer<typeof templateMetadataSchema>;
export type TemplateVersionInput = z.infer<typeof templateVersionInputSchema>;
export function parseTemplateInput(value: unknown): TemplateInput {
  const parsed = templateInputSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join(" "));
  return parsed.data;
}
export function parseTemplateMetadata(value: unknown): TemplateMetadataInput {
  const parsed = templateMetadataSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join(" "));
  return parsed.data;
}
export function parseTemplateVersionInput(value: unknown): TemplateVersionInput {
  const parsed = templateVersionInputSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join(" "));
  return parsed.data;
}
