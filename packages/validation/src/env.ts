import { z } from "zod";

export const apiEnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
