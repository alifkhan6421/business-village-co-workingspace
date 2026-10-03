"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionResult, fail, zodFieldErrors } from "@/lib/action-result";
import { emailSchema, formToObject, optString, phoneSchema, reqString } from "@/lib/validation";
import { sendContactEmails } from "@/lib/email/templates";

const schema = z.object({
  name: reqString(200),
  email: emailSchema,
  company: optString(200),
  phone: phoneSchema,
  message: reqString(5000),
  locale: z.enum(["de", "en"]).catch("de"),
  website: z.string().optional(), // honeypot
});

/** Public contact form endpoint. Anonymous users can only submit, never read. */
export async function submitContactRequest(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse(formToObject(formData));
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const v = parsed.data;
  if (v.website) return { ok: true }; // silently drop bots

  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("contact_requests")
    .select("id", { count: "exact", head: true })
    .ilike("email", v.email)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) return fail("rateLimited");

  const { data, error } = await admin
    .from("contact_requests")
    .insert({ name: v.name, email: v.email, company: v.company, phone: v.phone, message: v.message, locale: v.locale })
    .select("id")
    .single();
  if (error || !data) return fail("unknown");
  await sendContactEmails(data.id);
  return { ok: true };
}
