const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://web-ggs-e214.vercel.app",
];

export function getCorsOrigins(configuredValue: string | undefined, nodeEnv = process.env.NODE_ENV): string[] {
  return nodeEnv === "production"
    ? parseCorsOrigins(configuredValue ?? "")
    : uniqueOrigins([...DEFAULT_CORS_ORIGINS, ...parseCorsOrigins(configuredValue ?? "")]);
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  nodeEnv = process.env.NODE_ENV,
): boolean {
  if (!origin) return true;
  if (nodeEnv !== "production" && isLocalHttpOrigin(origin)) return true;

  return allowedOrigins.some((allowedOrigin) => originMatchesAllowedOrigin(origin, allowedOrigin));
}

export function parseCorsOrigins(value: string): string[] {
  return uniqueOrigins(
    value
      .split(",")
      .map((origin) => normalizeOrigin(origin))
      .filter((origin) => origin.length > 0),
  );
}

function originMatchesAllowedOrigin(origin: string, allowedOrigin: string): boolean {
  if (origin === allowedOrigin) return true;
  if (!allowedOrigin.includes("*")) return false;

  try {
    const requestOrigin = new URL(origin);
    const patternOrigin = new URL(allowedOrigin.replace("*.", "placeholder."));
    if (requestOrigin.protocol !== patternOrigin.protocol || requestOrigin.port !== patternOrigin.port) return false;

    const suffix = patternOrigin.hostname.replace(/^placeholder\./, ".");
    return requestOrigin.hostname.endsWith(suffix) && requestOrigin.hostname.length > suffix.length;
  } catch {
    return false;
  }
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function uniqueOrigins(origins: string[]): string[] {
  return Array.from(new Set(origins.map((origin) => normalizeOrigin(origin)).filter((origin) => origin.length > 0)));
}

function isLocalHttpOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.port !== "";
  } catch {
    return false;
  }
}
