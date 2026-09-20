const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function optionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function sanitizeExternalUrl(value: string | undefined) {
  const trimmed = optionalText(value);
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    return SAFE_URL_PROTOCOLS.has(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const appVersion = SEMVER_PATTERN.test(__APP_VERSION__) ? __APP_VERSION__ : "0.0.0";
export const buildSha = optionalText(__BUILD_SHA__);

export const systemMetadata = {
  productName: "GGS Document Studio",
  productFamily: "GGS System",
  vendorName: "GGS Code",
  poweredBy: "Powered by GGS Code",
  version: appVersion,
  build: buildSha,
  support: {
    email: optionalText(import.meta.env.VITE_SUPPORT_EMAIL),
    phone: optionalText(import.meta.env.VITE_SUPPORT_PHONE),
    websiteUrl: sanitizeExternalUrl(import.meta.env.VITE_SUPPORT_URL),
    documentationUrl: sanitizeExternalUrl(import.meta.env.VITE_DOCUMENTATION_URL),
    hours: optionalText(import.meta.env.VITE_SUPPORT_HOURS),
  },
} as const;

export function getSupportMailto(subject = "Soporte GGS Document Studio") {
  if (!systemMetadata.support.email) return undefined;
  return `mailto:${systemMetadata.support.email}?subject=${encodeURIComponent(subject)}`;
}

export function getDiagnosticInfo(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : undefined) {
  return [
    `Producto: ${systemMetadata.productName}`,
    `Versión: ${systemMetadata.version}`,
    systemMetadata.build ? `Compilación: ${systemMetadata.build}` : undefined,
    `Proveedor: ${systemMetadata.productFamily} / ${systemMetadata.vendorName}`,
    userAgent ? `Navegador: ${userAgent}` : undefined,
  ].filter(Boolean).join("\n");
}
