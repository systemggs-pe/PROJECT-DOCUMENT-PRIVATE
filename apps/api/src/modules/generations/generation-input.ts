import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const schema = z.object({
  templateId: z.string().uuid().optional(),
  templateVersionId: z.string().uuid().optional(),
  requestKey: z.string().uuid(),
  inputs: z.union([
    z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/), fileId: z.string().uuid() }).strict()),
    z.record(z.string().regex(/^[a-z][a-z0-9_]{0,59}$/), z.object({ storedFileId: z.string().uuid() }).strict()).transform((value) => Object.entries(value).map(([key, item]) => ({ key, fileId: item.storedFileId }))),
  ]).pipe(z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/), fileId: z.string().uuid() }).strict()).max(100)),
  attachments: z.array(z.object({ fileId: z.string().uuid(), order: z.number().int().min(0).max(999).optional() }).strict()).max(20).default([]),
  variables: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,59}$/), z.string().max(500)).default({}),
}).strict();

export type GenerationInput = z.infer<typeof schema>;

export function parseGenerationInput(body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException("La solicitud de generacion no es valida.");
  if (!result.data.templateId && !result.data.templateVersionId) throw new BadRequestException("Indica una plantilla o una version de plantilla.");
  if (new Set(result.data.inputs.map((item) => item.key)).size !== result.data.inputs.length) throw new BadRequestException("No repitas campos de imagen.");
  if (new Set(result.data.attachments.map((item) => item.fileId)).size !== result.data.attachments.length) throw new BadRequestException("No repitas anexos PDF.");
  return result.data;
}
