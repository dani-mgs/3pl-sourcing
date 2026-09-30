// Turns free-text contact fields into safe hrefs. Each returns null when the
// value can't be a safe link, and the caller shows it as plain text instead.

// Website: only http(s). A bare domain ("acme.com") gets https://. Anything
// with another scheme (javascript:, data:, ...) is refused.
export function websiteHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

// One plain address only, so the field can't smuggle mailto query params.
export function mailtoHref(value: string): string | null {
  const trimmed = value.trim();
  return /^[^\s@?&]+@[^\s@?&]+\.[^\s@?&]+$/.test(trimmed) ? `mailto:${trimmed}` : null;
}

// Digits and a leading +, with formatting stripped; null with too few digits.
export function telHref(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 5) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
