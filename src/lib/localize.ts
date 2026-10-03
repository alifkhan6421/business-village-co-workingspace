import type { Locale } from "@/i18n/routing";

/** Picks `${field}_${locale}` with German fallback. */
export function pickLocalized<T extends Record<string, unknown>>(row: T | null | undefined, field: string, locale: Locale): string {
  if (!row) return "";
  const value = row[`${field}_${locale}`];
  if (typeof value === "string" && value.trim() !== "") return value;
  const fallback = row[`${field}_de`];
  return typeof fallback === "string" ? fallback : "";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "de" ? "en" : "de";
}
