import { getTranslations } from "next-intl/server";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { findAvailableIds, getAmenities, listResources, type ResourceType } from "@/lib/resources";
import { berlinToUtc, todayBerlin } from "@/lib/time";
import { getSiteSettings } from "@/lib/cms";
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

/** Filterable, availability-aware resource grid (Coworking + Meeting Rooms pages). */
export async function ResourceList({ type, locale, searchParams }: { type: ResourceType; locale: Locale; searchParams: ListSearchParams }) {
  const t = await getTranslations({ locale, namespace: "site" });
  const [all, amenities, settings] = await Promise.all([listResources(type, locale), getAmenities(locale), getSiteSettings(locale)]);
  const relevantAmenities = amenities.filter((a) => a.type === type || a.type === "general");

  const date = one(searchParams.date) ?? "";
  const start = one(searchParams.start) ?? "";
  const end = one(searchParams.end) ?? "";
  const floor = one(searchParams.floor) ?? "";
  const zone = one(searchParams.zone) ?? "";
  const capacity = Number(one(searchParams.capacity) ?? "") || 0;
  const amenityFilter = ([] as string[]).concat(searchParams.amenity ?? []);

  let availableIds: Set<string> | null = null;
  const from = date && start ? berlinToUtc(date, start) : null;
  const to = date && end ? berlinToUtc(date, end) : null;
  if (from && to && to > from) availableIds = await findAvailableIds(type, from, to);

  const filtered = all.filter((r) => {
    if (floor && r.floor !== floor) return false;
    if (zone && r.zone !== zone) return false;
    if (capacity && r.capacity < capacity) return false;
    if (amenityFilter.length && !amenityFilter.every((slug) => r.amenities.some((a) => a.slug === slug))) return false;
    return true;
  });
  // When a time range is selected, free resources come first.
  const sorted = availableIds ? [...filtered].sort((a, b) => Number(availableIds!.has(b.id)) - Number(availableIds!.has(a.id))) : filtered;

  const floors = [...new Set(all.map((r) => r.floor).filter(Boolean))].sort();
  const zones = [...new Set(all.map((r) => r.zone).filter(Boolean))].sort();
  const times = timeOptions(settings.booking_day_start.slice(0, 5), settings.booking_day_end.slice(0, 5), settings.booking_slot_minutes);
  const bookQuery = from && to ? new URLSearchParams({ date, start, end }).toString() : undefined;
  const activeFilters = Boolean(date || floor || zone || capacity || amenityFilter.length);
  const moreFiltersCount = [floor, zone, capacity].filter(Boolean).length + amenityFilter.length;
  const moreFiltersActive = moreFiltersCount > 0;

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <form method="get" className="mb-10 rounded-2xl border bg-card p-4 shadow-md sm:p-5" data-testid="resource-filters">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_auto] lg:items-end">
          <label className="block min-w-0 space-y-1.5 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{t("dateLabel")}</span>
            <Input type="date" name="date" defaultValue={date} min={todayBerlin()} />
          </label>
          <label className="block min-w-0 space-y-1.5 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{t("fromLabel")}</span>
            <NativeSelect name="start" defaultValue={start}>
              <option value="">–</option>
              {times.slice(0, -1).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="block min-w-0 space-y-1.5 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{t("toLabel")}</span>
            <NativeSelect name="end" defaultValue={end}>
              <option value="">–</option>
              {times.slice(1).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </NativeSelect>
          </label>
          <Button type="submit" className="sm:col-span-3 lg:col-span-1">
            <Search /> {date && start && end ? t("checkAvailability") : t("applyFilters")}
          </Button>
        </div>
        <details className="group mt-3 border-t pt-3" open={moreFiltersActive}>
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-foreground/80 hover:text-foreground [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-4 w-4" /> {t("filters")}
            {moreFiltersCount ? <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{moreFiltersCount}</span> : null}
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
        </details>
      </form>

      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {t("resultsCount", { count: sorted.length })}
        </p>
        {activeFilters ? (
          <Button asChild variant="ghost" size="sm">
            <a href="?">{t("clearFilters")}</a>
          </Button>
        ) : null}
      </div>
      {sorted.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="resource-grid">
          {sorted.map((r) => (
            <ResourceCard key={r.id} resource={r} locale={locale} availability={availableIds ? availableIds.has(r.id) : undefined} bookQuery={bookQuery} />
          ))}
        </div>
      ) : (
        <EmptyState title={activeFilters ? t("noResults") : t("noResources")} description={activeFilters ? t("noResultsHint") : undefined} />
      )}
    </section>
  );
}
