"use server";
import { z } from "zod";
import { adminAction, logActivity, revalidateSite } from "./common";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, intSchema, optString, reqString, slugSchema } from "@/lib/validation";

/** "31", "31,50" or "31.5" → "31.50" (kept as a string for the numeric column). */
const money = z
  .string()
  .trim()
  .regex(/^\d{1,7}([.,]\d{1,2})?$/, "invalidNumber")
  .transform((v) => v.replace(",", "."));
const optMoney = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().regex(/^\d{1,7}([.,]\d{1,2})?$/, "invalidNumber").transform((v) => v.replace(",", ".")).nullable());
const optInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number({ message: "invalidNumber" }).int("invalidNumber").min(min, "invalidNumber").max(max, "invalidNumber").nullable());

const settingsSchema = z.object({
  vat_rate: z
    .string()
    .trim()
    .regex(/^\d{1,2}([.,]\d{1,2})?$|^100$/, "invalidNumber")
    .transform((v) => v.replace(",", ".")),
  prices_include_vat: z.enum(["true", "false"]).transform((v) => v === "true"),
  display_mode: z.enum(["gross", "net"]),
});

export async function savePricingSettings(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = settingsSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const { error } = await ctx.supabase.from("pricing_settings").update({ ...parsed.data, vat_rate: parsed.data.vat_rate as unknown as number }).eq("id", 1);
    if (error) return fail("unknown");
    await logActivity(ctx, "PRICING_SETTINGS_UPDATED", "pricing", null, parsed.data);
    revalidateSite();
    return { ok: true };
  });
}

const packageSchema = z
  .object({
    id: z.string().optional(),
    slug: slugSchema,
    name_de: reqString(120),
    name_en: reqString(120),
    description_de: optString(1000),
    description_en: optString(1000),
    pricing_mode: z.enum(["hourly_tiers", "fixed", "per_person"], { message: "invalidValue" }),
    price: optMoney,
    price_max: optMoney,
    duration_unit: z.enum(["hour", "half_day", "full_day", "custom", "unspecified"], { message: "invalidValue" }),
    duration_hours: optInt(1, 24),
    min_hours: intSchema(1, 24),
    max_hours: intSchema(1, 24),
    extra_hour_increment: optMoney,
    min_participants: intSchema(1, 1000),
    max_participants: optInt(1, 1000),
    included_participants: optInt(1, 1000),
    extra_person_price: optMoney,
    room_id: z.string().optional().transform((v) => (v && z.uuid().safeParse(v).success ? v : null)),
    price_is_final: checkbox,
    active: checkbox,
    sort_order: intSchema(0, 9999),
  })
  .superRefine((v, ctx) => {
    if (v.max_hours < v.min_hours) ctx.addIssue({ code: "custom", path: ["max_hours"], message: "invalidNumber" });
    if (v.max_participants !== null && v.max_participants < v.min_participants) ctx.addIssue({ code: "custom", path: ["max_participants"], message: "invalidNumber" });
    if (v.pricing_mode !== "hourly_tiers" && v.price === null) ctx.addIssue({ code: "custom", path: ["price"], message: "required" });
    if (["half_day", "full_day", "custom"].includes(v.duration_unit) && v.duration_hours === null) ctx.addIssue({ code: "custom", path: ["duration_hours"], message: "required" });
    if (v.price !== null && v.price_max !== null && Number(v.price_max) < Number(v.price)) ctx.addIssue({ code: "custom", path: ["price_max"], message: "invalidNumber" });
    if (v.extra_person_price !== null && v.included_participants === null) ctx.addIssue({ code: "custom", path: ["included_participants"], message: "required" });
  });

export async function savePricingPackage(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return adminAction(async (ctx) => {
    const parsed = packageSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const { id: rawId, ...v } = parsed.data;
    const row = {
      ...v,
      description_de: v.description_de ?? "",
      description_en: v.description_en ?? "",
      extra_hour_increment: v.extra_hour_increment ?? "0",
      // Only per-person packages use a maximum price.
      price_max: v.pricing_mode === "per_person" ? v.price_max : null,
      duration_hours: ["half_day", "full_day", "custom"].includes(v.duration_unit) ? v.duration_hours : null,
    } as never;
    let id = rawId && z.uuid().safeParse(rawId).success ? rawId : undefined;
    if (id) {
      const { error } = await ctx.supabase.from("pricing_packages").update(row).eq("id", id);
      if (error) return error.code === "23505" ? fail("validation", { slug: "slugTaken" }) : fail("unknown");
    } else {
      const { data, error } = await ctx.supabase.from("pricing_packages").insert(row).select("id").single();
      if (error || !data) return error?.code === "23505" ? fail("validation", { slug: "slugTaken" }) : fail("unknown");
      id = data.id;
    }
    await logActivity(ctx, rawId ? "PRICING_PACKAGE_UPDATED" : "PRICING_PACKAGE_CREATED", "pricing_package", id!, { slug: v.slug });
    revalidateSite();
    return { ok: true, data: { id: id! } };
  });
}

export async function setPricingPackageActive(id: string, active: boolean): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    if (!z.uuid().safeParse(id).success) return fail("notFound");
    const { error } = await ctx.supabase.from("pricing_packages").update({ active }).eq("id", id);
    if (error) return fail("unknown");
    await logActivity(ctx, "PRICING_PACKAGE_UPDATED", "pricing_package", id, { active });
    revalidateSite();
    return { ok: true };
  });
}

/** Past requests keep their price snapshot, so a package can be removed at any time. */
export async function deletePricingPackage(id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    if (!z.uuid().safeParse(id).success) return fail("notFound");
    const { data: pkg } = await ctx.supabase.from("pricing_packages").select("slug").eq("id", id).maybeSingle();
    const { error } = await ctx.supabase.from("pricing_packages").delete().eq("id", id);
    if (error) return fail("unknown");
    await logActivity(ctx, "PRICING_PACKAGE_DELETED", "pricing_package", id, { slug: pkg?.slug });
    revalidateSite();
    return { ok: true };
  });
}

const tierSchema = z.object({
  package_id: z.uuid(),
  hours: intSchema(1, 24),
  hourly_rate: money,
  active: checkbox,
});

/** Adds a duration tier or changes the rate of an existing one (one tier per duration). */
export async function savePricingTier(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = tierSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const { error } = await ctx.supabase.from("pricing_hourly_tiers").upsert({ ...parsed.data, hourly_rate: parsed.data.hourly_rate as unknown as number }, { onConflict: "package_id,hours" });
    if (error) return fail("unknown");
    await logActivity(ctx, "PRICING_TIER_SAVED", "pricing_package", parsed.data.package_id, { hours: parsed.data.hours, rate: parsed.data.hourly_rate, active: parsed.data.active });
    revalidateSite();
    return { ok: true };
  });
}

export async function deletePricingTier(packageId: string, hours: number): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    if (!z.uuid().safeParse(packageId).success || !Number.isInteger(hours)) return fail("notFound");
    const { error } = await ctx.supabase.from("pricing_hourly_tiers").delete().eq("package_id", packageId).eq("hours", hours);
    if (error) return fail("unknown");
    await logActivity(ctx, "PRICING_TIER_DELETED", "pricing_package", packageId, { hours });
    revalidateSite();
    return { ok: true };
  });
}
