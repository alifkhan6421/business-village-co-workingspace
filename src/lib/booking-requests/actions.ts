"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { type ActionResult, dbErrorKey, fail, zodFieldErrors } from "@/lib/action-result";
import { emailSchema, optString, phoneSchema, reqString } from "@/lib/validation";
import { berlinToUtc } from "@/lib/time";
import { centsToDecimal, computeEstimate, estimateSnapshot } from "@/lib/pricing/calc";
import { loadPricingConfig } from "@/lib/pricing/load";
import { sendBookingRequestAdminNotification, sendBookingRequestEmail } from "@/lib/email/templates";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const requestSchema = z.object({
  date: z.string().regex(DATE, "invalidDate"),
  start_time: z.string().regex(TIME, "invalidTime"),
  hours: z.coerce.number({ message: "invalidNumber" }).int("invalidNumber").min(1, "invalidNumber").max(24, "invalidNumber"),
  participants: z.coerce.number({ message: "invalidNumber" }).int("invalidNumber").min(1, "invalidNumber").max(1000, "invalidNumber"),
  option: z.string().max(100).optional(),
  full_name: reqString(200),
  email: emailSchema,
  phone: phoneSchema,
  company: optString(200),
  message: optString(2000),
  room: z.string().max(80).optional(),
  locale: z.enum(["de", "en"]).catch("de"),
  // Honeypot field: real visitors never fill it in.
  website: z.string().max(0, "invalidValue").optional().or(z.literal("")),
});

export type RequestCreated = { reference: string };

/** Abuse guard for anonymous requests: a handful per email address per hour. */
async function rateLimited(email: string) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("booking_requests")
    .select("id", { count: "exact", head: true })
    .eq("contact_email", email.trim().toLowerCase())
    .gte("created_at", since);
  return (count ?? 0) >= 5;
}

/**
 * submitBookingRequest — the only way visitors ask for a meeting room. It
 * never reserves a room: the request is stored as "pending" until an admin
 * assigns a room and confirms it. The estimate is recalculated here from the
 * current pricing rules; whatever total the browser showed is ignored.
 */
export async function submitBookingRequest(_: unknown, fd: FormData): Promise<ActionResult<RequestCreated>> {
  const parsed = requestSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const v = parsed.data;
  if (v.website) return fail("validation");

  const start = berlinToUtc(v.date, v.start_time);
  if (!start) return fail("validation", { date: "invalidDate" });
  const end = new Date(start.getTime() + v.hours * 3600 * 1000);
  if (start.getTime() < Date.now()) return fail("validation", { date: "dateInPast" });
  if (await rateLimited(v.email)) return fail("rateLimited");

  const admin = createAdminClient();
  const config = await loadPricingConfig({ client: admin });
  const estimate = computeEstimate(config, { hours: v.hours, participants: v.participants }, v.option);

  let preferredRoomId: string | null = null;
  if (v.room) {
    const { data: room } = await admin.from("rooms").select("id").eq("slug", v.room).eq("public_visible", true).maybeSingle();
    preferredRoomId = room?.id ?? null;
  }
  const current = await getCurrentUser();

  const { data, error } = await admin.rpc("submit_booking_request", {
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_duration_hours: v.hours,
    p_participants: v.participants,
    p_full_name: v.full_name,
    p_email: v.email,
    p_phone: v.phone ?? "",
    p_company: v.company ?? "",
    p_message: v.message ?? "",
    p_locale: v.locale,
    p_user_id: (current?.user.id ?? null) as string,
    p_preferred_room_id: preferredRoomId as string,
    p_price_snapshot: (estimate ? estimateSnapshot(estimate, config) : null) as never,
    p_net: (estimate ? centsToDecimal(estimate.netCents) : null) as unknown as number,
    p_vat: (estimate ? centsToDecimal(estimate.vatCents) : null) as unknown as number,
    p_gross: (estimate ? centsToDecimal(estimate.grossCents) : null) as unknown as number,
  });
  if (error || !data?.[0]) return fail(dbErrorKey(error));
  const row = data[0];

  await sendBookingRequestEmail(row.request_id, "received");
  await sendBookingRequestAdminNotification(row.request_id);
  revalidatePath("/[locale]/admin", "layout");
  return { ok: true, data: { reference: row.reference } };
}
