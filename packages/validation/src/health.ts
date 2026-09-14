import { z } from "zod";

export const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.literal("ggs-document-studio-api"),
  database: z.enum(["not_configured", "connected", "unreachable"]),
});

export type HealthStatusSchema = z.infer<typeof healthStatusSchema>;
