import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const ownerProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(160).optional(),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().trim().regex(/^[0-9+() .-]{1,40}$/).nullable().optional(),
}).strict();

export type OwnerProfileUpdateInput = z.infer<typeof ownerProfileUpdateSchema>;

export function parseOwnerProfileUpdate(value: unknown): OwnerProfileUpdateInput {
  const parsed = ownerProfileUpdateSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Los datos del titular no son validos.");
  return parsed.data;
}
