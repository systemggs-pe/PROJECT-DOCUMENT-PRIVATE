import { getSupportMailto, optionalText, sanitizeExternalUrl, supportConfig } from "@/config/support-config";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export { getSupportMailto, sanitizeExternalUrl };

export const appVersion = SEMVER_PATTERN.test(__APP_VERSION__) ? __APP_VERSION__ : "0.0.0";
export const buildSha = optionalText(__BUILD_SHA__);

export const systemMetadata = {
  productName: "GGS Document Studio",
  productFamily: "GGS System",
  vendorName: "GGS Code",
  poweredBy: "Powered by GGS Code",
  version: appVersion,
  build: buildSha,
  support: supportConfig,
} as const;

export function getDiagnosticInfo(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : undefined) {
  return [
    `Producto: ${systemMetadata.productName}`,
    `Versión: ${systemMetadata.version}`,
    systemMetadata.build ? `Compilación: ${systemMetadata.build}` : undefined,
    `Proveedor: ${systemMetadata.productFamily} / ${systemMetadata.vendorName}`,
    userAgent ? `Navegador: ${userAgent}` : undefined,
  ].filter(Boolean).join("\n");
}
