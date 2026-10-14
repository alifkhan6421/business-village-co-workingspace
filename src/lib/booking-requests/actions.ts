"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { type ActionResult, dbErrorKey, fail, zodFieldErrors } from "@/lib/action-result";
import { emailSchema, optString, phoneSchema, reqString } from "@/lib/validation";
import { berlinToUtc } from "@/lib/time";
import { centsToDecimal, quoteRequest } from "@/lib/pricing/calc";
import { loadPricingConfig } from "@/lib/pricing/server";
import { sendRequestAdminNotification, sendRequestEmail } from "@/lib/email/request-emails";

const requestSchema = z.object({
  spaceType: z.enum(["room", "workspace"]).catch("room"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalidTime"),
  hours: z.coerce.number({ message: "invalidNumber" }).int("invalidNumber").min(1, "invalidNumber").max(24, "invalidNumber"),
  participants: z.coerce.number({ message: "invalidNumber" }).int("invalidNumber").min(1, "invalidNumber").max(1000, "invalidNumber"),
  packageId: z.string().uuid().optional().or(z.literal("")).catch(""),
  room: z.string().max(80).optional().catch(undefined),
  fullName: reqString(200),
  email: emailSchema,
  phone: phoneSchema,
  company: optString(200),
  message: optString(2000),
  locale: z.enum(["de", "en"]).catch("de"),
  // Honeypot field: real users never fill it in.
  website: z.string().max(0).optional().or(z.literal("")),
});

export type RequestSubmitted = { reference: string };

/** Abuse guard for the public form: at most 5 requests per email address per hour. */
async function rateLimited(email: string) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("booking_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase())
    .gte("created_at", since);
  return (count ?? 0) >= 5;
}

/**
 * submitBookingRequest — the only way visitors book from the public site.
 * The price is recalculated here from the database rules (the browser's
 * estimate is ignored) and stored as a snapshot with the request. Nothing
 * is reserved: the team assigns a room and confirms in the admin panel.
 */
export async function submitBookingRequest(input: unknown): Promise<ActionResult<RequestSubmitted>> {
  try {
    return await submit(input);
  } catch (e) {
    // e.g. SUPABASE_SERVICE_ROLE_KEY missing in this deployment's environment.
    console.error("[booking request]", e instanceof Error ? e.message : e);
    return fail("unknown");
  }
}

async function submit(input: unknown): Promise<ActionResult<RequestSubmitted>> {
  const parsed = requestSchema.safeParse(input ?? {});
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const v = parsed.data;
  if (v.website) return fail("validation");

  const start = berlinToUtc(v.date, v.start);
  if (!start) return fail("validation", { date: "invalidDate" });
  if (start.getTime() < Date.now()) return fail("request.start_in_past", { date: "dateInPast" });
  if (await rateLimited(v.email)) return fail("rateLimited");

  const config = await loadPricingConfig();
  // Pricing packages cover meeting rooms; desk requests are quoted by the team.
  const quote = v.spaceType === "room" ? quoteRequest(config, v.hours, v.participants, v.packageId || null) : null;

  const admin = createAdminClient();
  let sourceRoomId: string | null = null;
  if (v.spaceType === "room" && v.room && /^[a-z0-9-]+$/.test(v.room)) {
    const { data } = await admin.from("rooms").select("id").eq("slug", v.room).eq("public_visible", true).maybeSingle();
    sourceRoomId = data?.id ?? null;
  }
  const current = await getCurrentUser();

  const snapshot = quote ? { ...quote, version: 1, calculatedAt: new Date().toISOString() } : null;
  const { data, error } = await admin.rpc("submit_booking_request", {
    p_space_type: v.spaceType,
    p_start: start.toISOString(),
    p_hours: v.hours,
    p_participants: v.participants,
    p_full_name: v.fullName,
    p_email: v.email,
    p_phone: v.phone ?? "",
    p_company: v.company ?? "",
    p_message: v.message ?? "",
    p_locale: v.locale,
    p_user_id: (current?.user.id ?? null) as string,
    p_source_room_id: sourceRoomId as string,
    p_package_id: (quote?.packageId ?? null) as string,
    p_estimate: snapshot as never,
    p_estimate_gross: (quote ? centsToDecimal(quote.grossCents) : null) as unknown as number,
  });
  if (error || !data?.[0]) {
    if (error && dbErrorKey(error, "request") === "unknown") console.error("[booking request]", error.message);
    return fail(dbErrorKey(error, "request"));
  }
  const row = data[0];

  await sendRequestEmail(row.request_id, "received");
  await sendRequestAdminNotification(row.request_id);
  revalidatePath("/[locale]/admin", "layout");
  return { ok: true, data: { reference: row.reference } };
}
