"use server";
import { z } from "zod";
import { adminAction, revalidateSite } from "./common";
import { dbErrorKey, fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, intSchema, optString, reqString, slugSchema } from "@/lib/validation";
import { sanitizeRichText, stripHtml } from "@/lib/sanitize";
import { berlinToUtc } from "@/lib/time";

const priceSchema = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const s = (v ?? "").trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      ctx.addIssue({ code: "custom", message: "invalidNumber" });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

/** PostgREST "column not found": the price migration has not been applied to this database yet. */
const missingColumn = (e: { code?: string } | null) => e?.code === "PGRST204" || e?.code === "42703";

export type ResourceKind = "workspace" | "room";
const TABLE = { workspace: "workspaces", room: "rooms" } as const;

const baseSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  name: reqString(80),
  slug: slugSchema,
  floor: optString(40),
  capacity: intSchema(1, 500),
  display_order: intSchema(0, 9999),
  status: z.enum(["available", "maintenance", "disabled"], { message: "invalidValue" }),
  featured: checkbox,
  public_visible: checkbox,
  short_description_de: optString(400),
  short_description_en: optString(400),
  full_description_de: z.string().max(20000, "tooLong").optional(),
  full_description_en: z.string().max(20000, "tooLong").optional(),
  price_hourly: priceSchema,
  price_daily: priceSchema,
});
const workspaceSchema = baseSchema.extend({ desk_number: optString(20), zone: optString(40) });

export async function saveResource(kind: ResourceKind, _: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return adminAction(async (ctx) => {
    const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
    const parsed = (kind === "workspace" ? workspaceSchema : baseSchema).safeParse(raw);
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data as z.infer<typeof workspaceSchema>;
    const row = {
      name: v.name,
      slug: v.slug,
      floor: v.floor ?? "",
      capacity: v.capacity,
      display_order: v.display_order,
      status: v.status,
      featured: v.featured,
      public_visible: v.public_visible,
      short_description_de: stripHtml(v.short_description_de ?? ""),
      short_description_en: stripHtml(v.short_description_en ?? ""),
      full_description_de: sanitizeRichText(v.full_description_de),
      full_description_en: sanitizeRichText(v.full_description_en),
      ...(kind === "workspace" ? { desk_number: v.desk_number, zone: v.zone ?? "" } : {}),
    };
    const withPrices = { ...row, price_hourly: v.price_hourly, price_daily: v.price_daily };
    const write = async (values: typeof row) => {
      if (v.id) {
        const { error } = await ctx.supabase.from(TABLE[kind]).update(values as never).eq("id", v.id);
        return { id: v.id, error };
      }
      const { data, error } = await ctx.supabase.from(TABLE[kind]).insert(values as never).select("id").single();
      return { id: (data as { id: string } | null)?.id, error };
    };
    let res = await write(withPrices);
    // Without the price columns, save everything else rather than failing the whole form.
    if (missingColumn(res.error)) res = await write(row);
    if (res.error || !res.id) return res.error?.code === "23505" ? fail("validation", { slug: "slugTaken" }) : fail(dbErrorKey(res.error, ""));
    const id = res.id;
    const amenityIds = fd.getAll("amenity_ids").filter((x): x is string => typeof x === "string" && x.length > 0);
    if (fd.has("amenities_present")) {
      const { error } = await ctx.supabase.rpc("admin_set_amenities", { p_type: kind, p_resource_id: id!, p_amenity_ids: amenityIds });
      if (error) return fail(dbErrorKey(error, ""));
    }
    revalidateSite();
    return { ok: true, data: { id: id! } };
  });
}

/** Copies a space (details, prices, amenities, photos) as a hidden draft named "… (Kopie)". */
export async function duplicateResource(kind: ResourceKind, id: string, copyLabel: string): Promise<ActionResult<{ id: string }>> {
  return adminAction(async (ctx) => {
    const table = TABLE[kind];
    const { data: src, error } = await ctx.supabase.from(table).select("*").eq("id", id).maybeSingle();
    if (error || !src) return fail("notFound");
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = src as Record<string, unknown>;
    void _id; void _c; void _u;
    const baseSlug = `${String(rest.slug)}-copy`.slice(0, 70);
    let newId: string | undefined;
    for (let n = 1; n <= 20 && !newId; n++) {
      const slug = n === 1 ? baseSlug : `${baseSlug}-${n}`;
      const name = `${String(rest.name)} (${copyLabel})`.slice(0, 80);
      const { data, error: e } = await ctx.supabase.from(table).insert({ ...rest, slug, name, public_visible: false, featured: false } as never).select("id").single();
      if (!e && data) newId = (data as { id: string }).id;
      else if (e?.code !== "23505") return fail(dbErrorKey(e, ""));
    }
    if (!newId) return fail("unknown");
    const relTable = kind === "workspace" ? "workspace_amenities" : "room_amenities";
    const col = kind === "workspace" ? "workspace_id" : "room_id";
    const { data: am } = await ctx.supabase.from(relTable).select("amenity_id").eq(col as never, id);
    if (am?.length) await ctx.supabase.rpc("admin_set_amenities", { p_type: kind, p_resource_id: newId, p_amenity_ids: am.map((a) => a.amenity_id) });
    const imgTable = kind === "workspace" ? "workspace_images" : "room_images";
    const { data: imgs } = await ctx.supabase.from(imgTable).select("media_id, is_cover, display_order").eq(col as never, id).order("display_order");
    if (imgs?.length) {
      const cover = imgs.find((i) => i.is_cover)?.media_id ?? null;
      await setGallery(kind, newId, imgs.map((i) => i.media_id), cover);
    }
    revalidateSite();
    return { ok: true, data: { id: newId } };
  });
}

/** Quick enable/disable from the space list. */
export async function setResourceStatus(kind: ResourceKind, id: string, status: "available" | "disabled"): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { error } = await ctx.supabase.from(TABLE[kind]).update({ status } as never).eq("id", id);
    if (error) return fail(dbErrorKey(error, ""));
    revalidateSite();
    return { ok: true };
  });
}

/** Deletes a resource only when it has no bookings; otherwise it should be disabled. */
export async function deleteResource(kind: ResourceKind, id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const col = kind === "workspace" ? "workspace_id" : "room_id";
    const { count } = await ctx.supabase.from("bookings").select("id", { count: "exact", head: true }).eq(col, id);
    if ((count ?? 0) > 0) return fail("hasBookings");
    const { error } = await ctx.supabase.from(TABLE[kind]).delete().eq("id", id);
    if (error) return fail(error.code === "23503" ? "hasBookings" : "unknown");
    revalidateSite();
    return { ok: true };
  });
}

export async function setGallery(kind: ResourceKind, resourceId: string, mediaIds: string[], coverId: string | null): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const ids = z.array(z.uuid()).max(60).safeParse(mediaIds);
    if (!ids.success) return fail("validation");
    const { error } = await ctx.supabase.rpc("admin_set_gallery", {
      p_type: kind,
      p_resource_id: resourceId,
      p_media_ids: ids.data,
      p_cover_id: coverId ?? (undefined as unknown as string),
    });
    if (error) return fail(dbErrorKey(error, ""));
    revalidateSite();
    return { ok: true };
  });
}

const blockSchema = z.object({
  resource_type: z.enum(["workspace", "room"]),
  resource_id: z.uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "invalidTime"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "invalidTime"),
  reason: z.enum(["maintenance", "private_event", "repairs", "cleaning", "administrative_hold"], { message: "invalidValue" }),
  note: optString(500),
});

export async function createBlock(_: unknown, fd: FormData): Promise<ActionResult<{ overlapping: number }>> {
  return adminAction(async (ctx) => {
    const parsed = blockSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const start = berlinToUtc(v.start_date, v.start_time);
    const end = berlinToUtc(v.end_date, v.end_time);
    if (!start || !end || end <= start) return fail("validation", { end_time: "endBeforeStart" });
    const { data, error } = await ctx.supabase.rpc("admin_create_block", {
      p_type: v.resource_type,
      p_resource_id: v.resource_id,
      p_start: start.toISOString(),
      p_end: end.toISOString(),
      p_reason: v.reason,
      p_note: v.note ?? "",
    });
    if (error) return fail(dbErrorKey(error));
    revalidateSite();
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, data: { overlapping: Number(row?.overlapping_bookings ?? 0) } };
  });
}

export async function deleteBlock(id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { error } = await ctx.supabase.rpc("admin_delete_block", { p_block_id: id });
    if (error) return fail(dbErrorKey(error));
    revalidateSite();
    return { ok: true };
  });
}
