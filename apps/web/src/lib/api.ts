import { healthStatusSchema } from "@ggs/validation";

const DEFAULT_API_URL = "http://localhost:3000";

export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? DEFAULT_API_URL;
}

export async function getHealth() {
  const response = await fetch(`${getApiBaseUrl()}/health`);

  if (!response.ok) {
    throw new Error("API health check failed");
  }

  const payload: unknown = await response.json();
  return healthStatusSchema.parse(payload);
}
