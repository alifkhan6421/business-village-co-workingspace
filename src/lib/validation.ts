import { z } from "zod";

// All messages are keys in the "validation" namespace.
export const reqString = (max = 200) =>
  z.string({ message: "required" }).trim().min(1, "required").max(max, "tooLong");
export const optString = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .optional()
    .transform((v) => (v ? v : null));
export const emailSchema = z.string({ message: "required" }).trim().min(1, "required").max(254, "tooLong").email("invalidEmail");
export const phoneSchema = z
  .string()
  .trim()
  .max(40, "tooLong")
  .regex(/^[+()0-9\s/-]*$/, "invalidPhone")
  .optional()
  .transform((v) => (v ? v : null));
export const slugSchema = z
  .string()
  .trim()
  .min(1, "required")
  .max(80, "tooLong")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "invalidSlug");
export const localeSchema = z.enum(["de", "en"]).catch("de");
export const passwordSchema = z
  .string()
  .min(8, "passwordTooShort")
  .max(72, "tooLong")
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), "passwordWeak");

/** Internal path ("/contact") or absolute https URL. Rejects javascript:, data:, //host etc. */
export function isSafeHref(value: string): boolean {
  const v = value.trim();
  if (!v || /[\s<>"'`\\]/.test(v)) return false;
  if (v.startsWith("/")) return !v.startsWith("//");
  try {
    const url = new URL(v);
    return url.protocol === "https:" && !!url.hostname;
  } catch {
    return false;
  }
}
export const hrefSchema = z.string().trim().min(1, "required").max(500, "tooLong").refine(isSafeHref, "invalidUrl");
export const optHrefSchema = z
  .string()
  .trim()
  .max(500, "tooLong")
  .refine((v) => !v || isSafeHref(v), "invalidUrl");

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const intSchema = (min: number, max: number) =>
  z.coerce.number({ message: "invalidNumber" }).int("invalidNumber").min(min, "invalidNumber").max(max, "invalidNumber");

export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
