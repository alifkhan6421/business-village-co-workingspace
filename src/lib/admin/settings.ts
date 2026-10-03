"use server";
import { z } from "zod";
import { adminAction, logActivity, revalidateSite } from "./common";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, emailSchema, intSchema, isSafeHref, optString, reqString } from "@/lib/validation";

const optUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.uuid().safeParse(v).success, "invalidValue");
const optEmail = z
  .string()
  .trim()
  .max(254, "tooLong")
  .refine((v) => !v || z.email().safeParse(v).success, "invalidEmail")
  .transform((v) => v || "");
const text = (max: number) => z.string().trim().max(max, "tooLong").optional().transform((v) => v ?? "");
const TIME = /^([01]\d|2[0-3]):(00|15|30|45)$|^24:00$/;

const sections = {
  business: z.object({
    company_name: reqString(120),
    company_legal_name: text(200),
    address_line_1: text(200),
    address_line_2: text(200),
    postcode: text(20),
    city: text(100),
    country: text(100),
    phone: z.string().trim().max(40, "tooLong").regex(/^[+()0-9\s/-]*$/, "invalidPhone"),
    general_email: optEmail,
    booking_email: optEmail,
    support_email: optEmail,
    opening_hours_de: text(1000),
    opening_hours_en: text(1000),
    logo_media_id: optUuid,
    favicon_media_id: optUuid,
    announcement_banner_de: text(300),
    announcement_banner_en: text(300),
  }),
  booking: z
    .object({
      booking_day_start: z.string().regex(TIME, "invalidTime"),
      booking_day_end: z.string().regex(TIME, "invalidTime"),
      booking_slot_minutes: z.coerce.number().refine((v) => [15, 30, 60].includes(v), "invalidNumber"),
      booking_max_hours: intSchema(1, 24),
      booking_max_days_ahead: intSchema(1, 730),
      cancellation_cutoff_hours: intSchema(0, 168),
    })
    .refine((v) => v.booking_day_end > v.booking_day_start, { message: "endBeforeStart", path: ["booking_day_end"] }),
  footer: z.object({
    footer_description_de: text(600),
    footer_description_en: text(600),
    footer_copyright_de: text(200),
    footer_copyright_en: text(200),
    footer_logo_media_id: optUuid,
  }),
  seo: z.object({
    default_seo_title_de: text(70),
    default_seo_title_en: text(70),
    default_seo_description_de: text(170),
    default_seo_description_en: text(170),
    default_seo_image_id: optUuid,
  }),
};

export type SettingsSection = keyof typeof sections;

export async function saveSiteSettings(section: SettingsSection, _: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const schema = sections[section];
    if (!schema) return fail("validation");
    const raw: Record<string, unknown> = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const values: Record<string, unknown> = { ...parsed.data };

    if (section === "booking") {
      const days = fd.getAll("booking_weekdays").map(Number).filter((d) => d >= 1 && d <= 7);
      if (days.length === 0) return fail("validation", { booking_weekdays: "required" });
      values.booking_weekdays = [...new Set(days)].sort();
    }
    if (section === "footer") {
      const labels = fd.getAll("social_label").map(String);
      const urls = fd.getAll("social_url").map(String);
      const links: { label: string; url: string }[] = [];
      for (let i = 0; i < Math.min(labels.length, urls.length, 12); i++) {
        const label = labels[i].trim().slice(0, 40);
        const url = urls[i].trim();
        if (!label && !url) continue;
        if (!label) return fail("validation", { [`social_label_${i}`]: "required" });
        if (!url.startsWith("https://") || !isSafeHref(url)) return fail("validation", { [`social_url_${i}`]: "invalidUrl" });
        links.push({ label, url });
      }
      values.social_links = links;
    }

    const { error } = await ctx.supabase.from("site_settings").update(values as never).eq("id", 1);
    if (error) return fail("unknown");
    await logActivity(ctx, "SETTINGS_UPDATED", "site_settings", null, { key: section });
    revalidateSite();
    return { ok: true };
  });
}

const contactSchema = z.object({
  contact_destination_email: emailSchema,
  contact_confirmation_enabled: checkbox,
  contact_admin_notification_enabled: checkbox,
  booking_admin_notification_enabled: checkbox,
});

export async function saveContactSettings(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = contactSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const { error } = await ctx.supabase.from("private_settings").update(parsed.data).eq("id", 1);
    if (error) return fail("unknown");
    await logActivity(ctx, "SETTINGS_UPDATED", "private_settings", null, { key: "contact" });
    return { ok: true };
  });
}

const templateSchema = z.object({
  template_key: z.enum([
    "welcome", "verify_email", "password_reset", "booking_confirmation", "guest_booking_confirmation", "booking_updated",
    "booking_cancelled", "contact_confirmation", "contact_admin_notification", "booking_admin_notification", "booking_message",
  ]),
  subject_de: reqString(200),
  heading_de: optString(200),
  intro_de: optString(2000),
  outro_de: optString(2000),
  subject_en: reqString(200),
  heading_en: optString(200),
  intro_en: optString(2000),
  outro_en: optString(2000),
});

/** Email texts are plain text with {{placeholders}}; the layout escapes them when rendering. */
export async function saveEmailTemplate(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = templateSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const rows = (["de", "en"] as const).map((l) => ({
      template_key: v.template_key,
      locale: l,
      subject: v[`subject_${l}`],
      heading: v[`heading_${l}`] ?? "",
      intro: v[`intro_${l}`] ?? "",
      outro: v[`outro_${l}`] ?? "",
    }));
    const { error } = await ctx.supabase.from("email_templates").upsert(rows, { onConflict: "template_key,locale" });
    if (error) return fail("unknown");
    await logActivity(ctx, "EMAIL_TEMPLATE_UPDATED", "email_template", null, { key: v.template_key });
    return { ok: true };
  });
}
