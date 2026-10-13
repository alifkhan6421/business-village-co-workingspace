import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Tables } from "@/lib/supabase/database.types";
import { toCents, type PricingConfig, type PricingPackage, type PricingSettings } from "./calc";

type PackageRow = Tables<"pricing_packages"> & { pricing_hourly_tiers: Tables<"pricing_hourly_tiers">[] };

export function mapSettings(row: Tables<"pricing_settings"> | null): PricingSettings {
  return {
    vatBasisPoints: toCents(row?.vat_rate ?? "19.00") ?? 1900,
    pricesIncludeVat: row?.prices_include_vat ?? true,
    displayMode: row?.display_mode === "net" ? "net" : "gross",
  };
}

export function mapPackage(p: PackageRow): PricingPackage {
  return {
    id: p.id,
    slug: p.slug,
    nameDe: p.name_de,
    nameEn: p.name_en,
    descriptionDe: p.description_de,
    descriptionEn: p.description_en,
    mode: p.pricing_mode as PricingPackage["mode"],
    priceCents: toCents(p.price),
    priceMaxCents: toCents(p.price_max),
    durationUnit: p.duration_unit as PricingPackage["durationUnit"],
    durationHours: p.duration_hours,
    minHours: p.min_hours,
    maxHours: p.max_hours,
    extraHourIncrementCents: toCents(p.extra_hour_increment) ?? 0,
    minParticipants: p.min_participants,
    maxParticipants: p.max_participants,
    includedParticipants: p.included_participants,
    extraPersonPriceCents: toCents(p.extra_person_price),
    roomId: p.room_id,
    priceIsFinal: p.price_is_final,
    active: p.active,
    sortOrder: p.sort_order,
    tiers: (p.pricing_hourly_tiers ?? [])
      .map((t) => ({ hours: t.hours, rateCents: toCents(t.hourly_rate) ?? 0, active: t.active }))
      .sort((a, b) => a.hours - b.hours),
  };
}

/**
 * Reads the pricing rules from the database on every call (no caching), so a
 * change in the admin panel applies to the next calculation without a deploy.
 * Public reads use the anon key (RLS exposes active packages and tiers only);
 * `includeInactive` is for admin recalculations and uses the service role.
 */
export async function loadPricingConfig({ includeInactive = false } = {}): Promise<PricingConfig> {
  const admin = includeInactive
    ? createAdminClient()
    : createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
  let pq = admin.from("pricing_packages").select("*, pricing_hourly_tiers(*)").order("sort_order").order("name_de");
  if (!includeInactive) pq = pq.eq("active", true);
  const [{ data: settings }, { data: packages }] = await Promise.all([
    admin.from("pricing_settings").select("*").eq("id", 1).maybeSingle(),
    pq,
  ]);
  const mapped = ((packages ?? []) as PackageRow[]).map(mapPackage);
  if (!includeInactive) for (const p of mapped) p.tiers = p.tiers.filter((t) => t.active);
  return { settings: mapSettings(settings), packages: mapped };
}
