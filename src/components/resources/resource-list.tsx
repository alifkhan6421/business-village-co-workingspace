import { getTranslations } from "next-intl/server";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { getAmenities, listResources, type ResourceType } from "@/lib/resources";
import type { Locale } from "@/i18n/routing";
import { ResourceCard } from "./resource-card";

export type ListSearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export function timeOptions(start = "07:00", end = "21:00", step = 30) {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const out: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Filterable resource grid (Coworking + Meeting Rooms pages). Availability is
 * never shown publicly: visitors send a booking request instead.
 */
export async function ResourceList({ type, locale, searchParams }: { type: ResourceType; locale: Locale; searchParams: ListSearchParams }) {
  const t = await getTranslations({ locale, namespace: "site" });
  const [all, amenities] = await Promise.all([listResources(type, locale), getAmenities(locale)]);
  const relevantAmenities = amenities.filter((a) => a.type === type || a.type === "general");

  const floor = one(searchParams.floor) ?? "";
  const zone = one(searchParams.zone) ?? "";
  const capacity = Number(one(searchParams.capacity) ?? "") || 0;
  const amenityFilter = ([] as string[]).concat(searchParams.amenity ?? []);

  const filtered = all.filter((r) => {
    if (floor && r.floor !== floor) return false;
    if (zone && r.zone !== zone) return false;
    if (capacity && r.capacity < capacity) return false;
    if (amenityFilter.length && !amenityFilter.every((slug) => r.amenities.some((a) => a.slug === slug))) return false;
    return true;
  });

  const floors = [...new Set(all.map((r) => r.floor).filter(Boolean))].sort();
  const zones = [...new Set(all.map((r) => r.zone).filter(Boolean))].sort();
  const activeFilters = Boolean(floor || zone || capacity || amenityFilter.length);

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <form method="get" className="mb-10 rounded-2xl border bg-card p-4 shadow-md sm:p-5" data-testid="resource-filters">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="block min-w-0 space-y-1.5 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{t("floor")}</span>
            <NativeSelect name="floor" defaultValue={floor}>
              <option value="">{t("anyFloor")}</option>
              {floors.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </NativeSelect>
          </label>
          {type === "workspace" ? (
            <label className="block min-w-0 space-y-1.5 text-sm">
              <span className="text-xs font-semibold text-muted-foreground">{t("zone")}</span>
              <NativeSelect name="zone" defaultValue={zone}>
                <option value="">{t("anyZone")}</option>
                {zones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </NativeSelect>
            </label>
          ) : null}
          <label className="block min-w-0 space-y-1.5 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{t("minCapacity")}</span>
            <Input type="number" name="capacity" min={1} max={500} defaultValue={capacity || ""} />
          </label>
          <Button type="submit">
            <Search /> {t("applyFilters")}
          </Button>
        </div>
        {relevantAmenities.length ? (
          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-semibold text-muted-foreground">{t("amenities")}</legend>
            <div className="flex flex-wrap gap-2">
              {relevantAmenities.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm transition-colors hover:border-foreground/20 has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:checked]:text-secondary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  <input type="checkbox" name="amenity" value={a.slug} defaultChecked={amenityFilter.includes(a.slug)} className="accent-[var(--primary)]" />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </form>

      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {t("resultsCount", { count: filtered.length })}
        </p>
        {activeFilters ? (
          <Button asChild variant="ghost" size="sm">
            <a href="?">{t("clearFilters")}</a>
          </Button>
        ) : null}
      </div>
      {filtered.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="resource-grid">
          {filtered.map((r) => (
            <ResourceCard key={r.id} resource={r} locale={locale} />
          ))}
        </div>
      ) : (
        <EmptyState title={activeFilters ? t("noResults") : t("noResources")} description={activeFilters ? t("noResultsHint") : undefined} />
      )}
    </section>
  );
}
