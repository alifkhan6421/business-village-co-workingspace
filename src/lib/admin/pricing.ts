"use server";
import { z } from "zod";
import { adminAction, revalidateSite } from "./common";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, intSchema, reqString } from "@/lib/validation";

// Pricing tables are protected by RLS (admin write); the database triggers
// write every change to the activity log with before/after values.

const money = z
  .string({ message: "required" })
  .trim()
  .min(1, "required")
  .transform((v) => v.replace(",", "."))
  .refine((v) => /^\d{1,7}(\.\d{1,2})?$/.test(v), "invalidPrice");
const optMoney = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(",", ".") : null))
  .refine((v) => v === null || /^\d{1,7}(\.\d{1,2})?$/.test(v), "invalidPrice");
const optInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), "invalidNumber");
const text = (max: number) => z.string().trim().max(max, "tooLong").optional().transform((v) => v ?? "");
const optUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.uuid().safeParse(v).success, "invalidValue");

const settingsSchema = z.object({
  vat_rate: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, "invalidNumber"),
  prices_include_vat: z.enum(["true", "false"]).transform((v) => v === "true"),
  display_mode: z.enum(["gross", "net"]),
  show_vat_breakdown: checkbox,
  note_de: text(1000),
  note_en: text(1000),
});

export async function savePricingSettings(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = settingsSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const { error } = await ctx.supabase.from("pricing_settings").update(parsed.data as never).eq("id", 1);
    if (error) return fail("unknown");
    revalidateSite();
    return { ok: true };
  });
}

const planSchema = z
  .object({
    name_de: reqString(120),
    name_en: reqString(120),
    description_de: text(1000),
    description_en: text(1000),
    room_id: optUuid,
    min_participants: intSchema(1, 1000),
    max_participants: intSchema(1, 1000),
    min_hours: intSchema(1, 24),
    max_hours: intSchema(1, 24),
    extra_hour_increment: money,
    price_type: z.enum(["fixed", "estimate"]),
    active: checkbox,
    display_order: intSchema(-1000, 10000),
  })
  .refine((v) => v.min_participants <= v.max_participants, { message: "minAboveMax", path: ["max_participants"] })
  .refine((v) => v.min_hours <= v.max_hours, { message: "minAboveMax", path: ["max_hours"] });

export async function savePricingPlan(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return adminAction(async (ctx) => {
    const id = String(fd.get("id") ?? "");
    const parsed = planSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const row = parsed.data as never;
    if (id) {
      if (!z.uuid().safeParse(id).success) return fail("notFound");
      const { error } = await ctx.supabase.from("price_hourly_plans").update(row).eq("id", id);
      if (error) return fail("unknown");
      revalidateSite();
      return { ok: true, data: { id } };
    }
    const { data, error } = await ctx.supabase.from("price_hourly_plans").insert(row).select("id").single();
    if (error || !data) return fail("unknown");
    revalidateSite();
    return { ok: true, data: { id: data.id } };
  });
}

export async function deletePricingPlan(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("id"));
    if (!id.success) return fail("notFound");
    const { error } = await ctx.supabase.from("price_hourly_plans").delete().eq("id", id.data);
    if (error) return fail("unknown");
    revalidateSite();
    return { ok: true };
  });
}

const tierSchema = z.object({
  plan_id: z.uuid("invalidValue"),
  hours: intSchema(1, 24),
  hourly_rate: money,
  active: checkbox,
});

/** Adds or updates one duration tier ("8 hours → €31/h"). One tier per duration and plan. */
export async function savePricingTier(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = String(fd.get("id") ?? "");
    const parsed = tierSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const row = parsed.data as never;
    const { error } = id
      ? z.uuid().safeParse(id).success
        ? await ctx.supabase.from("price_hourly_tiers").update(row).eq("id", id)
        : { error: { code: "notFound" } }
      : await ctx.supabase.from("price_hourly_tiers").insert(row);
    if (error) return error.code === "23505" ? fail("validation", { hours: "tierExists" }) : fail("unknown");
    revalidateSite();
    return { ok: true };
  });
}

export async function deletePricingTier(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("id"));
    if (!id.success) return fail("notFound");
    const { error } = await ctx.supabase.from("price_hourly_tiers").delete().eq("id", id.data);
    if (error) return fail("unknown");
    revalidateSite();
    return { ok: true };
  });
}

const packageSchema = z
  .object({
    name_de: reqString(120),
    name_en: reqString(120),
    description_de: text(1000),
    description_en: text(1000),
    room_id: optUuid,
    pricing_mode: z.enum(["flat", "per_person"]),
    price: money,
    duration_type: z.enum(["hour", "half_day", "full_day", "custom"]),
    duration_hours: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v.replace(",", ".") : null))
      .refine((v) => v === null || (/^\d{1,2}(\.5|\.0)?$/.test(v) && Number(v) > 0 && Number(v) <= 24), "invalidNumber"),
    duration_label_de: text(120),
    duration_label_en: text(120),
    min_participants: intSchema(1, 1000),
    max_participants: optInt(1, 1000),
    extra_person_price: optMoney,
    max_extra_participants: optInt(1, 1000),
    price_type: z.enum(["fixed", "estimate"]),
    active: checkbox,
    display_order: intSchema(-1000, 10000),
  })
  .refine((v) => v.max_participants === null || v.min_participants <= v.max_participants, { message: "minAboveMax", path: ["max_participants"] })
  .refine((v) => v.extra_person_price === null || v.max_participants !== null, { message: "extraNeedsCapacity", path: ["extra_person_price"] });

export async function savePricePackage(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return adminAction(async (ctx) => {
    const id = String(fd.get("id") ?? "");
    const parsed = packageSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    // Half and full days get a default length unless one is entered.
    const row = {
      ...v,
      duration_hours: v.duration_hours ?? (v.duration_type === "half_day" ? "4" : v.duration_type === "full_day" ? "8" : null),
    } as never;
    if (id) {
      if (!z.uuid().safeParse(id).success) return fail("notFound");
      const { error } = await ctx.supabase.from("price_packages").update(row).eq("id", id);
      if (error) return fail("unknown");
      revalidateSite();
      return { ok: true, data: { id } };
    }
    const { data, error } = await ctx.supabase.from("price_packages").insert(row).select("id").single();
    if (error || !data) return fail("unknown");
    revalidateSite();
    return { ok: true, data: { id: data.id } };
  });
}

export async function deletePricePackage(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = z.uuid().safeParse(fd.get("id"));
    if (!id.success) return fail("notFound");
    const { error } = await ctx.supabase.from("price_packages").delete().eq("id", id.data);
    if (error) return fail("unknown");
    revalidateSite();
    return { ok: true };
  });
}
