"use client";
import { useTranslations } from "next-intl";

/** Translates error keys returned by server actions ("booking.slot_unavailable", "auth.invalidCredentials", "forbidden"). */
export function useErrorText() {
  const t = useTranslations();
  return (key: string | null | undefined) => {
    if (!key) return "";
    if (key.startsWith("auth.") && t.has(key)) return t(key);
    if (t.has(`errors.${key}`)) return t(`errors.${key}`);
    return t("errors.unknown");
  };
}

/** Translates validation keys for individual fields. */
export function useFieldErrorText() {
  const t = useTranslations("validation");
  return (key: string | null | undefined) => (key ? (t.has(key) ? t(key) : t("invalidValue")) : undefined);
}
