"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminAction } from "./common";
import { dbErrorKey, fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, reqString } from "@/lib/validation";
import { berlinToUtc } from "@/lib/time";
import { loadPricingConfig } from "@/lib/pricing/load";
import { centsToDecimal, computeEstimate, estimateSnapshot, splitVat, toCents } from "@/lib/pricing/calc";
import { sendBookingRequestEmail, type RequestEmailKind } from "@/lib/email/templates";

// Every write goes through a SECURITY DEFINER function that checks is_admin(),
// locks the request row and records an event with the admin, time and note.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ["pending", "under_review", "alternative_proposed", "confirmed", "rejected", "cancelled", "completed"] as const;
export type RequestStatus = (typeof STATUSES)[number];

const int = (min: number, max: number) => z.coerce.number({ message: "invalidNumber" }).int("invalidNumber").min(min, "invalidNumber").max(max, "invalidNumber");
const optUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.uuid().safeParse(v).success, "invalidValue");

function range(date: string, time: string, hours: number) {
  const start = berlinToUtc(date, time);
  if (!start) return null;
  return { start: start.toISOString(), end: new Date(start.getTime() + hours * 3_600_000).toISOString() };
}

function refresh(id?: string) {
  revalidatePath("/", "layout");
  if (id) revalidatePath(`/[locale]/admin/requests/${id}`, "page");
}

const detailsSchema = z.object({
  id: z.uuid(),
  date: z.string().regex(DATE, "invalidDate"),
  start_time: z.string().regex(TIME, "invalidTime"),
  hours: int(1, 24),
  participants: int(1, 1000),
  assigned_room_id: optUuid,
  option: z.string().max(100).optional(),
});

/** Saves date, duration, participants and room, and recalculates the quote on the server from current prices. */
export async function updateBookingRequestDetails(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = detailsSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const r = range(v.date, v.start_time, v.hours);
    if (!r) return fail("validation", { start_time: "invalidTime" });

    const config = await loadPricingConfig({ client: ctx.supabase });
    const estimate = computeEstimate(config, { hours: v.hours, participants: v.participants }, v.option || null);
    const snapshot = estimate ? estimateSnapshot(estimate, config) : null;
    const { error } = await ctx.supabase.rpc("admin_update_booking_request", {
      p_request_id: v.id,
      p_start: r.start,
      p_end: r.end,
      p_duration_hours: v.hours,
      p_participants: v.participants,
      p_assigned_room_id: v.assigned_room_id as string,
      p_quote_snapshot: snapshot as never,
      p_quote_net: (estimate ? centsToDecimal(estimate.netCents) : null) as unknown as number,
      p_quote_vat: (estimate ? centsToDecimal(estimate.vatCents) : null) as unknown as number,
      p_quote_gross: (estimate ? centsToDecimal(estimate.grossCents) : null) as unknown as number,
    });
    if (error) return fail(dbErrorKey(error));
    refresh(v.id);
    return { ok: true };
  });
}

const priceSchema = z.object({
  id: z.uuid(),
  amount: z
    .string({ message: "required" })
    .trim()
    .min(1, "required")
    .transform((v) => v.replace(",", "."))
    .refine((v) => /^\d{1,7}(\.\d{1,2})?$/.test(v), "invalidPrice"),
  reason: reqString(1000),
});

/** Manual price override. The amount is entered the way prices are stored (gross or net); VAT is derived exactly. */
export async function adjustBookingRequestPrice(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = priceSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const config = await loadPricingConfig({ client: ctx.supabase });
    const split = splitVat(toCents(v.amount), config.settings);
    const { error } = await ctx.supabase.rpc("admin_adjust_booking_request_price", {
      p_request_id: v.id,
      p_net: centsToDecimal(split.netCents) as unknown as number,
      p_vat: centsToDecimal(split.vatCents) as unknown as number,
      p_gross: centsToDecimal(split.grossCents) as unknown as number,
      p_reason: v.reason,
    });
    if (error) return fail(dbErrorKey(error));
    refresh(v.id);
    return { ok: true };
  });
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(STATUSES, { message: "invalidValue" }),
  note: z.string().trim().max(4000, "tooLong").optional(),
  message: z.string().trim().max(5000, "tooLong").optional(),
  notify: checkbox,
  alt_date: z.string().optional(),
  alt_start: z.string().optional(),
  alt_hours: z.string().optional(),
});

const EMAIL_FOR: Partial<Record<RequestStatus, RequestEmailKind>> = {
  confirmed: "confirmed",
  rejected: "rejected",
  cancelled: "cancelled",
  alternative_proposed: "alternative",
};

/**
 * Moves a request through the workflow. Confirming assigns the request's room
 * through the regular booking engine, so a slot taken in the meantime (even by
 * a concurrent approval) fails with slot_unavailable instead of double booking.
 */
export async function setBookingRequestStatus(_: unknown, fd: FormData): Promise<ActionResult<{ bookingId: string | null }>> {
  return adminAction(async (ctx) => {
    const parsed = statusSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    let alt: { start: string; end: string } | null = null;
    if (v.status === "alternative_proposed") {
      const hours = Number(v.alt_hours);
      if (!v.alt_date || !DATE.test(v.alt_date)) return fail("validation", { alt_date: "invalidDate" });
      if (!v.alt_start || !TIME.test(v.alt_start)) return fail("validation", { alt_start: "invalidTime" });
      if (!Number.isInteger(hours) || hours < 1 || hours > 24) return fail("validation", { alt_hours: "invalidNumber" });
      alt = range(v.alt_date, v.alt_start, hours);
      if (!alt || new Date(alt.start) <= new Date()) return fail("validation", { alt_date: "dateInPast" });
    }
    const { data, error } = await ctx.supabase.rpc("admin_set_booking_request_status", {
      p_request_id: v.id,
      p_status: v.status,
      p_note: v.note ?? "",
      p_alt_start: (alt?.start ?? null) as string,
      p_alt_end: (alt?.end ?? null) as string,
    });
    if (error) return fail(dbErrorKey(error));
    const kind = EMAIL_FOR[v.status];
    if (v.notify && kind) await sendBookingRequestEmail(v.id, kind, { message: v.message, actorId: ctx.user.id });
    refresh(v.id);
    return { ok: true, data: { bookingId: (data as string | null) ?? null } };
  });
}

export async function addBookingRequestNote(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("id"));
    const note = reqString(4000).safeParse(fd.get("note"));
    if (!id.success) return fail("notFound");
    if (!note.success) return fail("validation", { note: "required" });
    const { error } = await ctx.supabase.rpc("admin_add_booking_request_note", { p_request_id: id.data, p_note: note.data });
    if (error) return fail(dbErrorKey(error));
    refresh(id.data);
    return { ok: true };
  });
}

/** Free-text message to the customer, sent in their language with the request reference. */
export async function sendBookingRequestMessage(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("id"));
    const message = reqString(5000).safeParse(fd.get("message"));
    if (!id.success) return fail("notFound");
    if (!message.success) return fail("validation", { message: "required" });
    const res = await sendBookingRequestEmail(id.data, "message", { message: message.data, actorId: ctx.user.id });
    if (!res?.ok) return fail("emailFailed");
    refresh(id.data);
    return { ok: true };
  });
}

export type RequestCalendarEvent = {
  id: string;
  reference: string;
  status: RequestStatus;
  start: string;
  end: string;
  name: string;
  participants: number;
  roomId: string | null;
  roomName: string | null;
};

/** Requests in a date range for the calendar view (alternative proposals are shown at the proposed time). */
export async function requestCalendarEvents(
  start: string,
  end: string,
  filter: { statuses: string[]; roomId?: string; minParticipants?: number; maxParticipants?: number },
): Promise<ActionResult<RequestCalendarEvent[]>> {
  return adminAction(async (ctx) => {
    if (!z.iso.datetime({ offset: true }).safeParse(start).success || !z.iso.datetime({ offset: true }).safeParse(end).success) return fail("invalidValue");
    let q = ctx.supabase
      .from("booking_requests")
      .select("id, reference, status, start_at, end_at, contact_name, participants, assigned_room_id, preferred_room_id, assigned_room:rooms!booking_requests_assigned_room_id_fkey(name), preferred_room:rooms!booking_requests_preferred_room_id_fkey(name)")
      .lt("start_at", end)
      .gt("end_at", start)
      .order("start_at")
      .limit(500);
    const statuses = filter.statuses.filter((s) => (STATUSES as readonly string[]).includes(s));
    if (statuses.length) q = q.in("status", statuses);
    if (filter.roomId && z.uuid().safeParse(filter.roomId).success) q = q.or(`assigned_room_id.eq.${filter.roomId},preferred_room_id.eq.${filter.roomId}`);
    if (filter.minParticipants) q = q.gte("participants", filter.minParticipants);
    if (filter.maxParticipants) q = q.lte("participants", filter.maxParticipants);
    const { data, error } = await q;
    if (error) return fail("unknown");
    return {
      ok: true,
      data: (data ?? []).map((r) => {
        const room = (r.assigned_room as { name: string } | null) ?? (r.preferred_room as { name: string } | null);
        return {
          id: r.id,
          reference: r.reference,
          status: r.status as RequestStatus,
          start: r.start_at,
          end: r.end_at,
          name: r.contact_name,
          participants: r.participants,
          roomId: r.assigned_room_id ?? r.preferred_room_id,
          roomName: room?.name ?? null,
        };
      }),
    };
  });
}
