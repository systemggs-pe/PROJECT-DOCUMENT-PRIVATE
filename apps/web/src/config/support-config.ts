const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function optionalText(value: string | undefined) {
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

export function normalizePhoneForHref(value: string | undefined) {
  const trimmed = optionalText(value);
  if (!trimmed) return undefined;
  return trimmed.replace(/[^\d+]/g, "");
}

export function normalizeWhatsAppNumber(value: string | undefined) {
  const phone = normalizePhoneForHref(value);
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  return digits || undefined;
}

export const supportConfig = {
  supportName: optionalText(import.meta.env.VITE_SUPPORT_NAME) ?? "GGS Code",
  supportEmail: optionalText(import.meta.env.VITE_SUPPORT_EMAIL),
  supportPhone: optionalText(import.meta.env.VITE_SUPPORT_PHONE),
  supportWhatsApp: optionalText(import.meta.env.VITE_SUPPORT_WHATSAPP),
  supportWebsite: sanitizeExternalUrl(import.meta.env.VITE_SUPPORT_WEBSITE ?? import.meta.env.VITE_SUPPORT_URL),
  documentationUrl: sanitizeExternalUrl(import.meta.env.VITE_DOCUMENTATION_URL),
  supportHours: optionalText(import.meta.env.VITE_SUPPORT_HOURS),
} as const;

export function getSupportMailto(subject = "Soporte GGS Document Studio") {
  if (!supportConfig.supportEmail) return undefined;
  return `mailto:${supportConfig.supportEmail}?subject=${encodeURIComponent(subject)}`;
}

export function getSupportPhoneHref() {
  const phone = normalizePhoneForHref(supportConfig.supportPhone);
  return phone ? `tel:${phone}` : undefined;
}

export function getSupportWhatsAppHref(message = "Hola, necesito ayuda con GGS Document Studio.") {
  const phone = normalizeWhatsAppNumber(supportConfig.supportWhatsApp);
  if (!phone) return undefined;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
