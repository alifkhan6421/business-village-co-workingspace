"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, type AdminContext } from "./common";
import { dbErrorKey, fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, reqString } from "@/lib/validation";
import { berlinToUtc } from "@/lib/time";
import { centsToDecimal, quotePackage, quoteRequest, splitVat, toCents, type Quote } from "@/lib/pricing/calc";
import { loadPricingConfig } from "@/lib/pricing/server";
import { sendRequestEmail } from "@/lib/email/request-emails";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type RequestRow = { id: string; space_type: string; package_id: string | null; price_adjusted: boolean; price_snapshot: unknown; price_gross: number | null; price_net: number | null; price_vat: number | null };

async function loadRequest(ctx: AdminContext, id: string) {
  const { data } = await ctx.supabase
    .from("booking_requests")
    .select("id, space_type, package_id, price_adjusted, price_snapshot, price_gross, price_net, price_vat, assigned_room_id, assigned_workspace_id, start_at, end_at, participants")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Server-side price for the given schedule: the request's own package if it still fits, else the best active one. */
async function priceFor(r: RequestRow, hours: number, participants: number): Promise<Quote | null> {
  if (r.space_type !== "room") return null;
  const config = await loadPricingConfig({ includeInactive: true });
  const own = r.package_id ? config.packages.find((p) => p.id === r.package_id) : undefined;
  if (own) {
    const res = quotePackage(own, hours, participants, config.settings);
    if (res.ok) return res.quote;
  }
  return quoteRequest({ ...config, packages: config.packages.filter((p) => p.active) }, hours, participants);
}

function priceParams(q: Quote | null) {
  return {
    p_price_snapshot: (q ? { ...q, version: 1, calculatedAt: new Date().toISOString() } : null) as never,
    p_price_net: (q ? centsToDecimal(q.netCents) : null) as unknown as number,
    p_price_vat: (q ? centsToDecimal(q.vatCents) : null) as unknown as number,
    p_price_gross: (q ? centsToDecimal(q.grossCents) : null) as unknown as number,
  };
}

function done() {
  revalidatePath("/", "layout");
  return { ok: true } as const;
}

const detailsSchema = z.object({
  id: z.uuid(),
  resource: z.string().regex(/^((room|workspace):[0-9a-f-]{36})?$/, "invalidValue"),
  date: z.string().regex(DATE, "invalidDate"),
  start_time: z.string().regex(TIME, "invalidTime"),
  hours: z.coerce.number({ message: "invalidNumber" }).int("invalidNumber").min(1, "invalidNumber").max(24, "invalidNumber"),
  participants: z.coerce.number({ message: "invalidNumber" }).int("invalidNumber").min(1, "invalidNumber").max(1000, "invalidNumber"),
  recalculate: checkbox,
  note: z.string().max(2000).optional(),
});

/** Assign or change the space, and adjust date, time, duration and group size. */
export async function saveRequestDetails(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = detailsSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const r = await loadRequest(ctx, v.id);
    if (!r) return fail("notFound");
    const start = berlinToUtc(v.date, v.start_time);
    if (!start) return fail("validation", { date: "invalidDate" });
    const end = new Date(start.getTime() + v.hours * 3600000);
    const [type, resourceId] = v.resource ? v.resource.split(":") : [null, null];

    const keepPrice = !v.recalculate;
    const quote = keepPrice ? null : await priceFor(r as RequestRow, v.hours, v.participants);
    const { error } = await ctx.supabase.rpc("admin_update_booking_request", {
      p_request_id: v.id,
      p_resource_type: (type ?? "room") as string,
      p_resource_id: resourceId as string,
      p_start: start.toISOString(),
      p_end: end.toISOString(),
      p_participants: v.participants,
      ...(keepPrice
        ? { p_price_snapshot: null as never, p_price_net: r.price_net as number, p_price_vat: r.price_vat as number, p_price_gross: r.price_gross as number }
        : priceParams(quote)),
      p_price_adjusted: keepPrice ? r.price_adjusted : false,
      p_adjustment_reason: "",
      p_event_type: keepPrice ? "updated" : "price_recalculated",
      p_note: v.note ?? "",
    });
    if (error) return fail(dbErrorKey(error, "request"));
    return done();
  });
}

/** Recalculates the price from the current pricing rules (drops a manual adjustment). */
export async function recalculateRequestPrice(id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    if (!z.uuid().safeParse(id).success) return fail("notFound");
    const r = await loadRequest(ctx, id);
    if (!r) return fail("notFound");
    const hours = Math.round((new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 3600000);
    const quote = await priceFor(r as RequestRow, hours, r.participants);
    const { error } = await ctx.supabase.rpc("admin_update_booking_request", {
      p_request_id: id,
      p_resource_type: r.assigned_workspace_id ? "workspace" : "room",
      p_resource_id: (r.assigned_room_id ?? r.assigned_workspace_id) as string,
      p_start: r.start_at,
      p_end: r.end_at,
      p_participants: r.participants,
      ...priceParams(quote),
      p_price_adjusted: false,
      p_adjustment_reason: "",
      p_event_type: "price_recalculated",
      p_note: "",
    });
    if (error) return fail(dbErrorKey(error, "request"));
    return done();
  });
}

const adjustSchema = z.object({
  id: z.uuid(),
  gross: z
    .string()
    .trim()
    .regex(/^\d{1,7}([.,]\d{1,2})?$/, "invalidNumber")
    .transform((v) => v.replace(",", ".")),
  reason: reqString(1000),
});

/** Manual price (gross, VAT included) with a mandatory reason; net and VAT follow from the VAT rate. */
export async function adjustRequestPrice(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = adjustSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const r = await loadRequest(ctx, v.id);
    if (!r) return fail("notFound");
    const config = await loadPricingConfig();
    const grossCents = toCents(v.gross)!;
    const split = splitVat(grossCents, { ...config.settings, pricesIncludeVat: true });
    const previous = (r.price_snapshot ?? null) as Record<string, unknown> | null;
    const snapshot = {
      version: 1,
      manual: true,
      reason: v.reason,
      calculatedAt: new Date().toISOString(),
      ...split,
      maxGrossCents: null,
      vatBasisPoints: config.settings.vatBasisPoints,
      pricesIncludeVat: true,
      previousGrossCents: previous && typeof previous.grossCents === "number" ? previous.grossCents : toCents(r.price_gross),
    };
    const { error } = await ctx.supabase.rpc("admin_update_booking_request", {
      p_request_id: v.id,
      p_resource_type: r.assigned_workspace_id ? "workspace" : "room",
      p_resource_id: (r.assigned_room_id ?? r.assigned_workspace_id) as string,
      p_start: r.start_at,
      p_end: r.end_at,
      p_participants: r.participants,
      p_price_snapshot: snapshot as never,
      p_price_net: centsToDecimal(split.netCents) as unknown as number,
      p_price_vat: centsToDecimal(split.vatCents) as unknown as number,
      p_price_gross: centsToDecimal(split.grossCents) as unknown as number,
      p_price_adjusted: true,
      p_adjustment_reason: v.reason,
      p_event_type: "price_adjusted",
      p_note: v.reason,
    });
    if (error) return fail(dbErrorKey(error, "request"));
    return done();
  });
}

const STATUSES = ["pending", "under_review", "alternative_proposed", "confirmed", "rejected", "cancelled", "completed"] as const;
const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(STATUSES, { message: "invalidValue" }),
  note: z.string().trim().max(2000).optional(),
  alt_date: z.string().optional(),
  alt_start: z.string().optional(),
  alt_hours: z.string().optional(),
  notify: checkbox,
});

const EMAIL_FOR: Partial<Record<(typeof STATUSES)[number], "confirmed" | "rejected" | "alternative" | "cancelled">> = {
  confirmed: "confirmed",
  rejected: "rejected",
  alternative_proposed: "alternative",
  cancelled: "cancelled",
};

/** Moves a request through its workflow; confirming reserves the assigned space. */
export async function setRequestStatus(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = statusSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    let altStart: string | null = null;
    let altEnd: string | null = null;
    if (v.status === "alternative_proposed") {
      const hours = Number(v.alt_hours);
      if (!v.alt_date || !DATE.test(v.alt_date)) return fail("validation", { alt_date: "invalidDate" });
      if (!v.alt_start || !TIME.test(v.alt_start)) return fail("validation", { alt_start: "invalidTime" });
      if (!Number.isInteger(hours) || hours < 1 || hours > 24) return fail("validation", { alt_hours: "invalidNumber" });
      const s = berlinToUtc(v.alt_date, v.alt_start);
      if (!s) return fail("validation", { alt_date: "invalidDate" });
      altStart = s.toISOString();
      altEnd = new Date(s.getTime() + hours * 3600000).toISOString();
    }
    if ((v.status === "rejected" || v.status === "cancelled") && !v.note) return fail("validation", { note: "required" });

    const { error } = await ctx.supabase.rpc("admin_set_booking_request_status", {
      p_request_id: v.id,
      p_status: v.status,
      p_note: v.note ?? "",
      p_alternative_start: altStart as string,
      p_alternative_end: altEnd as string,
    });
    if (error) return fail(dbErrorKey(error, "request"));
    const kind = EMAIL_FOR[v.status];
    if (kind && v.notify) {
      const res = await sendRequestEmail(v.id, kind);
      if (res?.ok) await ctx.supabase.rpc("admin_add_booking_request_event", { p_request_id: v.id, p_event_type: "message_sent", p_note: `email:${kind}` });
    }
    return done();
  });
}

export async function addRequestNote(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("request_id"));
    const note = reqString(5000).safeParse(fd.get("note"));
    if (!id.success) return fail("notFound");
    if (!note.success) return fail("validation", { note: "required" });
    const { error } = await ctx.supabase.rpc("admin_add_booking_request_event", { p_request_id: id.data, p_event_type: "note", p_note: note.data });
    if (error) return fail(dbErrorKey(error, "request"));
    return done();
  });
}

/** Free-text email to the customer; recorded in the request history. */
export async function sendRequestMessage(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("request_id"));
    const message = reqString(5000).safeParse(fd.get("message"));
    if (!id.success) return fail("notFound");
    if (!message.success) return fail("validation", { message: "required" });
    const res = await sendRequestEmail(id.data, "message", { message: message.data });
    if (!res?.ok) return fail("emailFailed");
    await ctx.supabase.rpc("admin_add_booking_request_event", { p_request_id: id.data, p_event_type: "message_sent", p_note: message.data });
    return done();
  });
}

export type RequestCalendarEvent = {
  id: string;
  reference: string;
  title: string;
  start: string;
  end: string;
  status: string;
  participants: number;
  resourceName: string | null;
};

/** Requests in a window for the admin request calendar (max. ~100 days). */
export async function requestCalendarEvents(from: string, to: string, statuses: string[]): Promise<ActionResult<RequestCalendarEvent[]>> {
  return adminAction(async (ctx) => {
    const f = new Date(from);
    const t = new Date(to);
    if (isNaN(+f) || isNaN(+t) || +t - +f > 100 * 86400000) return fail("validation");
    let q = ctx.supabase
      .from("booking_requests")
      .select("id, reference, full_name, company, start_at, end_at, status, participants, room:rooms!booking_requests_assigned_room_id_fkey(name), workspace:workspaces(name)")
      .lt("start_at", t.toISOString())
      .gt("end_at", f.toISOString())
      .limit(2000);
    const valid = statuses.filter((s) => (STATUSES as readonly string[]).includes(s));
    if (valid.length) q = q.in("status", valid);
    const { data, error } = await q;
    if (error) return fail("unknown");
    type Row = { id: string; reference: string; full_name: string; company: string | null; start_at: string; end_at: string; status: string; participants: number; room: { name: string } | null; workspace: { name: string } | null };
    return {
      ok: true,
      data: ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        reference: r.reference,
        title: `${r.full_name}${r.company ? ` (${r.company})` : ""} · ${r.participants}`,
        start: r.start_at,
        end: r.end_at,
        status: r.status,
        participants: r.participants,
        resourceName: r.room?.name ?? r.workspace?.name ?? null,
      })),
    };
  });
}
