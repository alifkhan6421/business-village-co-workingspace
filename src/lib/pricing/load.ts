import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Tables } from "@/lib/supabase/database.types";
import type { HourlyPlan, PricePackage, PricingConfig, PricingSettings } from "./calc";

const num = (v: number | string | null) => (v === null ? null : Number(v));

export function mapSettings(s: Tables<"pricing_settings"> | null): PricingSettings {
  return {
    vatRate: s ? Number(s.vat_rate) : 19,
    pricesIncludeVat: s?.prices_include_vat ?? true,
    displayMode: s?.display_mode === "net" ? "net" : "gross",
    showVatBreakdown: s?.show_vat_breakdown ?? true,
    noteDe: s?.note_de ?? "",
    noteEn: s?.note_en ?? "",
  };
}

export function mapPlan(p: Tables<"price_hourly_plans"> & { tiers?: Tables<"price_hourly_tiers">[] }): HourlyPlan {
  return {
    id: p.id,
    nameDe: p.name_de,
    nameEn: p.name_en,
    descriptionDe: p.description_de,
    descriptionEn: p.description_en,
    roomId: p.room_id,
    minParticipants: p.min_participants,
    maxParticipants: p.max_participants,
    minHours: p.min_hours,
    maxHours: p.max_hours,
    extraHourIncrement: Number(p.extra_hour_increment),
    priceType: p.price_type === "estimate" ? "estimate" : "fixed",
    active: p.active,
    displayOrder: p.display_order,
    tiers: (p.tiers ?? [])
      .map((t) => ({ id: t.id, hours: t.hours, hourlyRate: Number(t.hourly_rate), active: t.active }))
      .sort((a, b) => a.hours - b.hours),
  };
}

export function mapPackage(p: Tables<"price_packages">): PricePackage {
  return {
    id: p.id,
    nameDe: p.name_de,
    nameEn: p.name_en,
    descriptionDe: p.description_de,
    descriptionEn: p.description_en,
    roomId: p.room_id,
    pricingMode: p.pricing_mode === "per_person" ? "per_person" : "flat",
    price: Number(p.price),
    durationType: p.duration_type as PricePackage["durationType"],
    durationHours: num(p.duration_hours),
    durationLabelDe: p.duration_label_de,
    durationLabelEn: p.duration_label_en,
    minParticipants: p.min_participants,
    maxParticipants: p.max_participants,
    extraPersonPrice: num(p.extra_person_price),
    maxExtraParticipants: p.max_extra_participants,
    priceType: p.price_type === "fixed" ? "fixed" : "estimate",
    active: p.active,
    displayOrder: p.display_order,
  };
}

/**
 * Current pricing rules, read at request time (no caching), so a rate changed
 * in the admin panel applies to the next calculation without a deployment.
 * `includeInactive` is for the admin panel only.
 */
export async function loadPricingConfig(opts: { includeInactive?: boolean; client?: SupabaseClient<Database> } = {}): Promise<PricingConfig> {
  const db = opts.client ?? createAdminClient();
  let plans = db.from("price_hourly_plans").select("*, tiers:price_hourly_tiers(*)").order("display_order").order("name_de");
  let packages = db.from("price_packages").select("*").order("display_order").order("name_de");
  if (!opts.includeInactive) {
    plans = plans.eq("active", true);
    packages = packages.eq("active", true);
  }
  const [settings, p, k] = await Promise.all([db.from("pricing_settings").select("*").eq("id", 1).maybeSingle(), plans, packages]);
  if (p.error || k.error) throw new Error(p.error?.message ?? k.error?.message);
  const mappedPlans = (p.data ?? []).map((x) => mapPlan(x as never));
  return {
    settings: mapSettings(settings.data),
    plans: opts.includeInactive ? mappedPlans : mappedPlans.map((pl) => ({ ...pl, tiers: pl.tiers.filter((t) => t.active) })),
    packages: (k.data ?? []).map(mapPackage),
  };
}
