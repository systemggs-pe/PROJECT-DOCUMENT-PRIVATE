import { healthStatusSchema } from "@ggs/validation";

import { supabase } from "@/lib/supabase";

const DEFAULT_API_URL = "http://localhost:3000";

export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? DEFAULT_API_URL;
}

export async function getHealth() {
  const response = await apiFetch("/health", { skipAuth: true });

  if (!response.ok) {
    throw new Error("API health check failed");
  }

  const payload: unknown = await response.json();
  return healthStatusSchema.parse(payload);
}

export async function getMe() {
  const response = await apiFetch("/auth/me");

  if (!response.ok) {
    throw new ApiError(response.status, response.status === 403 ? "Tu cuenta esta desactivada." : response.status === 401 ? "Tu sesion ha caducado. Vuelve a iniciar sesion." : "No se pudo comprobar tu acceso. Intenta nuevamente.");
  }

  return response.json() as Promise<{
    id: string;
    authProviderId: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    isActive: boolean;
    status: "ACTIVE" | "INACTIVE";
    organizationId: string | null;
    organization: { id: string; name: string; slug: string; status: "ACTIVE" | "SUSPENDED" | "ARCHIVED" } | null;
    roles: Array<{ id: string; key: string; name: string; isSystem: boolean }>;
    permissions: string[];
  }>;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await apiFetch(path, { ...init, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string | string[]; error?: { message?: string } };
    const message = data.error?.message ?? data.message;
    throw new ApiError(response.status, Array.isArray(message) ? message.join(" ") : message ?? "No se pudo completar la solicitud.");
  }
  return response.json() as Promise<T>;
}

export async function downloadFile(id: string, name: string) {
  const response = await apiFetch(`/files/${id}/download`);
  if (!response.ok) throw new Error("No se pudo descargar el documento.");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadGeneration(id: string, name: string) {
  const response = await apiFetch(`/generations/${id}/download`);
  if (!response.ok) throw new Error("No se pudo descargar el PDF.");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function apiFetch(path: string, init: RequestInit & { skipAuth?: boolean } = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  if (!init.skipAuth && supabase) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
}
