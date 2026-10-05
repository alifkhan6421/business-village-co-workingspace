import type { Locale } from "@/i18n/routing";

export function formatPrice(amount: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Estimated price for a booking of `hours`: hourly rate capped at the day rate, or the day rate alone. */
export function estimatePrice(hours: number, hourly: number | null, daily: number | null) {
  if (hourly !== null) return daily !== null ? Math.min(hourly * hours, daily) : hourly * hours;
  return daily;
}
