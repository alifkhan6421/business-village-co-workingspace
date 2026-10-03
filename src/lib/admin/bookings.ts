"use server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { adminAction, logActivity } from "./common";
import { dbErrorKey, fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, emailSchema, optString, phoneSchema, reqString } from "@/lib/validation";
import { berlinToUtc } from "@/lib/time";
import { hashToken } from "@/lib/booking/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingEmail } from "@/lib/email/templates";
import { revalidatePath } from "next/cache";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

const slotSchema = z.object({
  type: z.enum(["workspace", "room"], { message: "invalidValue" }),
  resource_id: z.uuid("required"),
  date: z.string().regex(DATE, "invalidDate"),
  start_time: z.string().regex(TIME, "invalidTime"),
  end_time: z.string().regex(TIME, "invalidTime"),
  attendees: z.coerce.number({ message: "invalidNumber" }).int("invalidNumber").min(1, "invalidNumber").max(500, "invalidNumber"),
  purpose: optString(1000),
});

function toRange(v: { date: string; start_time: string; end_time: string }) {
  const start = berlinToUtc(v.date, v.start_time);
  const end = berlinToUtc(v.date, v.end_time);
  if (!start || !end || end <= start) return null;
  return { start: start.toISOString(), end: end.toISOString() };
}

const createSchema = slotSchema.extend({
  customer: z.enum(["member", "guest"]),
  user_id: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  locale: z.enum(["de", "en"]).catch("de"),
  notify: checkbox,
});
const guestSchema = z.object({ first_name: reqString(100), last_name: reqString(100), email: emailSchema, phone: phoneSchema, company: optString(200) });

export async function adminCreateBooking(_: unknown, fd: FormData): Promise<ActionResult<{ id: string; reference: string }>> {
  return adminAction(async (ctx) => {
    const parsed = createSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const range = toRange(v);
    if (!range) return fail("validation", { end_time: "endBeforeStart" });

    let userId: string | null = null;
    let guestId: string | null = null;
    if (v.customer === "member") {
      if (!v.user_id || !z.uuid().safeParse(v.user_id).success) return fail("validation", { user_id: "required" });
      userId = v.user_id;
    } else {
      const g = guestSchema.safeParse(v);
      if (!g.success) return fail("validation", zodFieldErrors(g.error));
      const { data: existing } = await ctx.supabase.from("guests").select("id").ilike("email", g.data.email).maybeSingle();
      const row = { first_name: g.data.first_name, last_name: g.data.last_name, phone: g.data.phone, company: g.data.company, locale: v.locale };
      if (existing) {
        await ctx.supabase.from("guests").update(row).eq("id", existing.id);
        guestId = existing.id;
      } else {
        const { data, error } = await ctx.supabase.from("guests").insert({ ...row, email: g.data.email.toLowerCase() }).select("id").single();
        if (error || !data) return fail("unknown");
        guestId = data.id;
      }
    }

    const { data, error } = await ctx.supabase.rpc("admin_create_booking", {
      p_type: v.type,
      p_resource_id: v.resource_id,
      p_start: range.start,
      p_end: range.end,
      p_user_id: userId as string,
      p_guest_id: guestId as string,
      p_attendees: v.attendees,
      p_purpose: v.purpose ?? "",
      p_locale: v.locale,
    });
    if (error) return fail(dbErrorKey(error));
    const row = (Array.isArray(data) ? data[0] : data) as { booking_id: string; booking_reference: string };

    let manageToken: string | undefined;
    if (guestId) {
      manageToken = randomBytes(32).toString("base64url");
      const { error: tErr } = await ctx.supabase.rpc("admin_set_booking_token", { p_booking_id: row.booking_id, p_token_hash: hashToken(manageToken) });
      if (tErr) manageToken = undefined;
    }
    if (v.notify) await sendBookingEmail(row.booking_id, "confirmation", { manageToken });
    revalidatePath("/", "layout");
    return { ok: true, data: { id: row.booking_id, reference: row.booking_reference } };
  });
}

const updateSchema = slotSchema.extend({
  id: z.uuid(),
  status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"], { message: "invalidValue" }),
  notify: checkbox,
});

/** Guests only have a hashed link; a schedule change issues a fresh link in the update email. */
async function freshGuestToken(ctx: Awaited<ReturnType<typeof import("@/lib/auth").assertAdmin>>, bookingId: string) {
  const { data: b } = await ctx.supabase.from("bookings").select("user_id, guest_id").eq("id", bookingId).single();
  if (!b || b.user_id || !b.guest_id) return undefined;
  const token = randomBytes(32).toString("base64url");
  const { error } = await ctx.supabase.rpc("admin_set_booking_token", { p_booking_id: bookingId, p_token_hash: hashToken(token) });
  return error ? undefined : token;
}

export async function adminUpdateBooking(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = updateSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const range = toRange(v);
    if (!range) return fail("validation", { end_time: "endBeforeStart" });
    const { data: before } = await ctx.supabase.from("bookings").select("status").eq("id", v.id).single();
    const { error } = await ctx.supabase.rpc("admin_update_booking", {
      p_booking_id: v.id,
      p_type: v.type,
      p_resource_id: v.resource_id,
      p_start: range.start,
      p_end: range.end,
      p_attendees: v.attendees,
      p_purpose: v.purpose ?? "",
      p_status: v.status,
    });
    if (error) return fail(dbErrorKey(error));
    if (v.notify) {
      if (v.status === "cancelled" && before?.status !== "cancelled") await sendBookingEmail(v.id, "cancelled");
      else if (v.status !== "cancelled") await sendBookingEmail(v.id, "updated", { manageToken: await freshGuestToken(ctx, v.id) });
    }
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function adminCancelBooking(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("id"));
    if (!id.success) return fail("notFound");
    const reason = String(fd.get("reason") ?? "").trim().slice(0, 1000);
    const { error } = await ctx.supabase.rpc("admin_cancel_booking", { p_booking_id: id.data, p_reason: reason });
    if (error) return fail(dbErrorKey(error));
    if (checkbox.parse(fd.get("notify"))) await sendBookingEmail(id.data, "cancelled");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function addBookingNote(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("booking_id"));
    const note = reqString(4000).safeParse(fd.get("note"));
    if (!id.success) return fail("notFound");
    if (!note.success) return fail("validation", { note: "required" });
    const { error } = await ctx.supabase.from("booking_notes").insert({ booking_id: id.data, note: note.data, author_id: ctx.user.id });
    if (error) return fail("unknown");
    await logActivity(ctx, "BOOKING_NOTE_ADDED", "booking", id.data);
    return { ok: true };
  });
}

/** Sends a message to the customer; the subject carries the reference so replies can be matched. */
export async function sendBookingMessage(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("booking_id"));
    const message = reqString(5000).safeParse(fd.get("message"));
    if (!id.success) return fail("notFound");
    if (!message.success) return fail("validation", { message: "required" });
    const res = await sendBookingEmail(id.data, "message", { message: message.data });
    if (!res?.ok) return fail("emailFailed");
    const admin = createAdminClient();
    const { data: log } = await admin.from("email_logs").select("subject, recipient").eq("related_booking_id", id.data).eq("email_type", "booking_message").order("created_at", { ascending: false }).limit(1).maybeSingle();
    await admin.from("booking_messages").insert({
      booking_id: id.data,
      direction: "outbound",
      sender_email: ctx.profile.email,
      sender_name: ctx.profile.full_name ?? null,
      subject: log?.subject ?? "",
      message: message.data,
      provider_message_id: res.id ?? null,
    });
    await logActivity(ctx, "BOOKING_MESSAGE_SENT", "booking", id.data, { to: log?.recipient });
    return { ok: true };
  });
}

export type MemberOption = { id: string; name: string; email: string; locale: string };

export async function searchMembers(q: string): Promise<ActionResult<MemberOption[]>> {
  return adminAction(async (ctx) => {
    const term = q.trim().replace(/[%_,()*\\]/g, " ").slice(0, 80);
    let query = ctx.supabase.from("profiles").select("id, full_name, email, preferred_locale").order("last_name").limit(20);
    if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`);
    const { data, error } = await query;
    if (error) return fail("unknown");
    return { ok: true, data: (data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email, email: p.email, locale: p.preferred_locale })) };
  });
}

export type CalendarEvent = {
  id: string;
  kind: "booking" | "block";
  title: string;
  start: string;
  end: string;
  status?: string;
  customer?: "member" | "guest";
  resourceType: "workspace" | "room";
  resourceId: string;
  reference?: string;
};

/** Bookings + blocks in a window for the admin calendar (max. ~100 days). */
export async function adminCalendarEvents(from: string, to: string, filter: { type?: string; resourceId?: string; statuses?: string[]; customer?: string; blocks?: boolean }): Promise<ActionResult<CalendarEvent[]>> {
  return adminAction(async (ctx) => {
    const f = new Date(from);
    const t = new Date(to);
    if (isNaN(+f) || isNaN(+t) || +t - +f > 100 * 86400000) return fail("validation");
    let q = ctx.supabase
      .from("bookings")
      .select("id, booking_reference, booking_type, workspace_id, room_id, user_id, guest_id, start_at, end_at, status, workspace:workspaces(name), room:rooms(name), guest:guests(first_name,last_name), member:profiles!bookings_user_id_fkey(full_name,email)")
      .lt("start_at", t.toISOString())
      .gt("end_at", f.toISOString())
      .limit(2000);
    if (filter.type === "workspace" || filter.type === "room") q = q.eq("booking_type", filter.type);
    if (filter.resourceId) q = q.or(`workspace_id.eq.${filter.resourceId},room_id.eq.${filter.resourceId}`);
    if (filter.statuses?.length) q = q.in("status", filter.statuses);
    if (filter.customer === "member") q = q.not("user_id", "is", null);
    if (filter.customer === "guest") q = q.is("user_id", null);
    const { data, error } = await q;
    if (error) return fail("unknown");
    type Row = {
      id: string; booking_reference: string; booking_type: "workspace" | "room"; workspace_id: string | null; room_id: string | null; user_id: string | null;
      start_at: string; end_at: string; status: string; workspace: { name: string } | null; room: { name: string } | null;
      guest: { first_name: string; last_name: string } | null; member: { full_name: string | null; email: string } | null;
    };
    const events: CalendarEvent[] = ((data ?? []) as unknown as Row[]).map((b) => ({
      id: b.id,
      kind: "booking",
      title: `${b.workspace?.name ?? b.room?.name ?? ""} · ${b.member ? b.member.full_name || b.member.email : `${b.guest?.first_name ?? ""} ${b.guest?.last_name ?? ""}`.trim()}`,
      start: b.start_at,
      end: b.end_at,
      status: b.status,
      customer: b.user_id ? "member" : "guest",
      resourceType: b.booking_type,
      resourceId: (b.workspace_id ?? b.room_id)!,
      reference: b.booking_reference,
    }));
    if (filter.blocks !== false) {
      let bq = ctx.supabase
        .from("resource_blocks")
        .select("id, resource_type, workspace_id, room_id, start_at, end_at, reason, workspace:workspaces(name), room:rooms(name)")
        .lt("start_at", t.toISOString())
        .gt("end_at", f.toISOString());
      if (filter.type === "workspace" || filter.type === "room") bq = bq.eq("resource_type", filter.type);
      if (filter.resourceId) bq = bq.or(`workspace_id.eq.${filter.resourceId},room_id.eq.${filter.resourceId}`);
      const { data: blocks } = await bq;
      for (const b of (blocks ?? []) as unknown as { id: string; resource_type: "workspace" | "room"; workspace_id: string | null; room_id: string | null; start_at: string; end_at: string; reason: string; workspace: { name: string } | null; room: { name: string } | null }[]) {
        events.push({
          id: b.id,
          kind: "block",
          title: `${b.workspace?.name ?? b.room?.name ?? ""} · ${b.reason}`,
          start: b.start_at,
          end: b.end_at,
          resourceType: b.resource_type,
          resourceId: (b.workspace_id ?? b.room_id)!,
        });
      }
    }
    return { ok: true, data: events };
  });
}
