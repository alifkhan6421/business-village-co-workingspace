"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { type ActionResult, dbErrorKey, fail, zodFieldErrors } from "@/lib/action-result";
import { emailSchema, optString, phoneSchema, reqString } from "@/lib/validation";
import { hashToken } from "./token";
import { sendBookingAdminNotification, sendBookingEmail } from "@/lib/email/templates";

const slotSchema = z
  .object({
    type: z.enum(["workspace", "room"]),
    resourceId: z.string().uuid("invalidValue"),
    start: z.string().datetime({ offset: true, message: "invalidDate" }),
    end: z.string().datetime({ offset: true, message: "invalidDate" }),
    attendees: z.coerce.number().int().min(1, "invalidNumber").max(500, "invalidNumber"),
    purpose: optString(1000),
    locale: z.enum(["de", "en"]).catch("de"),
  })
  .refine((v) => new Date(v.end) > new Date(v.start), { message: "endBeforeStart", path: ["end"] });

const guestSchema = z.object({
  firstName: reqString(100),
  lastName: reqString(100),
  email: emailSchema,
  phone: phoneSchema,
  company: optString(200),
  // Honeypot field: real users never fill it in.
  website: z.string().max(0).optional().or(z.literal("")),
});

export type BookingCreated = { reference: string; bookingId: string; manageToken?: string };

/** Simple abuse guard for anonymous booking: limited bookings per email per hour. */
async function guestRateLimited(email: string) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: guest } = await admin.from("guests").select("id").ilike("email", email).maybeSingle();
  if (!guest) return false;
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("guest_id", guest.id)
    .gte("created_at", since);
  return (count ?? 0) >= 10;
}

/**
 * createGuestBooking — the only path through which anonymous visitors can book.
 * Input is validated here; availability, blocks, conflicts, reference
 * generation, guest upsert and audit logging happen atomically in the
 * database function (callable by the service role only).
 */
export async function createGuestBooking(input: unknown): Promise<ActionResult<BookingCreated>> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const slot = slotSchema.safeParse(raw);
  const guest = guestSchema.safeParse(raw);
  if (!slot.success || !guest.success) {
    return fail("validation", {
      ...(slot.success ? {} : zodFieldErrors(slot.error)),
      ...(guest.success ? {} : zodFieldErrors(guest.error)),
    });
  }
  if (guest.data.website) return fail("validation");
  if (await guestRateLimited(guest.data.email)) return fail("rateLimited");

  const token = randomBytes(32).toString("base64url");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_guest_booking", {
    p_type: slot.data.type,
    p_resource_id: slot.data.resourceId,
    p_start: slot.data.start,
    p_end: slot.data.end,
    p_first_name: guest.data.firstName,
    p_last_name: guest.data.lastName,
    p_email: guest.data.email,
    p_phone: guest.data.phone ?? "",
    p_company: guest.data.company ?? "",
    p_purpose: slot.data.purpose ?? "",
    p_attendees: slot.data.attendees,
    p_locale: slot.data.locale,
    p_token_hash: hashToken(token),
  });
  if (error || !data?.[0]) return fail(dbErrorKey(error));
  const row = data[0];

  await sendBookingEmail(row.booking_id, "confirmation", { manageToken: token });
  await sendBookingAdminNotification(row.booking_id);
  revalidatePath("/[locale]/admin", "layout");
  return { ok: true, data: { reference: row.booking_reference, bookingId: row.booking_id, manageToken: token } };
}

/** createMemberBooking — the user is resolved from the session inside the database. */
export async function createMemberBooking(input: unknown): Promise<ActionResult<BookingCreated>> {
  const current = await getCurrentUser();
  if (!current) return fail("notAuthenticated");
  const slot = slotSchema.safeParse(input);
  if (!slot.success) return fail("validation", zodFieldErrors(slot.error));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_member_booking", {
    p_type: slot.data.type,
    p_resource_id: slot.data.resourceId,
    p_start: slot.data.start,
    p_end: slot.data.end,
    p_attendees: slot.data.attendees,
    p_purpose: slot.data.purpose ?? "",
    p_locale: slot.data.locale,
  });
  if (error || !data?.[0]) return fail(dbErrorKey(error));
  const row = data[0];
  await sendBookingEmail(row.booking_id, "confirmation");
  await sendBookingAdminNotification(row.booking_id);
  revalidatePath("/[locale]/account", "layout");
  return { ok: true, data: { reference: row.booking_reference, bookingId: row.booking_id } };
}

export async function cancelMyBooking(bookingId: string): Promise<ActionResult> {
  const current = await getCurrentUser();
  if (!current) return fail("notAuthenticated");
  if (!z.string().uuid().safeParse(bookingId).success) return fail("notFound");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_booking", { p_booking_id: bookingId });
  if (error) return fail(dbErrorKey(error));
  await sendBookingEmail(bookingId, "cancelled");
  revalidatePath("/[locale]/account", "layout");
  return { ok: true };
}

/** Guest self-service cancellation via the emailed management token. */
export async function cancelGuestBooking(token: string): Promise<ActionResult> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return fail("booking.not_found");
  const admin = createAdminClient();
  const hash = hashToken(token);
  const { data: booking } = await admin.from("bookings").select("id").eq("management_token_hash", hash).maybeSingle();
  if (!booking) return fail("booking.not_found");
  const { error } = await admin.rpc("cancel_booking_by_token", { p_token_hash: hash });
  if (error) return fail(dbErrorKey(error));
  await sendBookingEmail(booking.id, "cancelled");
  return { ok: true };
}
