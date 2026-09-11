import { z } from "zod";

export const healthStatusSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("ggs-document-studio-api"),
});

export type HealthStatusSchema = z.infer<typeof healthStatusSchema>;
