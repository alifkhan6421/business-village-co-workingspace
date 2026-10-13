"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/forms/submit-button";
import { useErrorText } from "@/components/forms/use-error-text";
import { DeleteButton } from "./delete-button";
import { LocaleTabs } from "./locale-tabs";
import { useAdminForm } from "./people-forms";
import { deletePricingPackage, deletePricingTier, savePricingPackage, savePricingSettings, savePricingTier, setPricingPackageActive } from "@/lib/admin/pricing";
import { formatCents, hourlyRate, toCents, type PricingPackage } from "@/lib/pricing/calc";

export type PackageRow = {
  id: string;
  slug: string;
  name_de: string;
  name_en: string;
  description_de: string;
  description_en: string;
  pricing_mode: string;
  price: string | null;
  price_max: string | null;
  duration_unit: string;
  duration_hours: number | null;
  min_hours: number;
  max_hours: number;
  extra_hour_increment: string;
  min_participants: number;
  max_participants: number | null;
  included_participants: number | null;
  extra_person_price: string | null;
  room_id: string | null;
  price_is_final: boolean;
  active: boolean;
  sort_order: number;
  tiers: { hours: number; hourly_rate: string; active: boolean }[];
};

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
/** Shows numeric values the way admins type them ("31" rather than "31.00"). */
const m = (v: string | null | undefined) => (v ? v.replace(/\.00$/, "") : "");

export function PricingSettingsForm({ v }: { v: { vat_rate: string; prices_include_vat: boolean; display_mode: string } }) {
  const t = useTranslations("admin.pricing");
  const tc = useTranslations("admin.common");
  const { onSubmit, pending, fe, alert } = useAdminForm(savePricingSettings, t("saved"));
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3" noValidate data-testid="pricing-settings-form">
      {alert ? <div className="sm:col-span-3">{alert}</div> : null}
      <Field label={t("vatRate")} htmlFor="ps-vat" error={fe("vat_rate")}>
        <Input id="ps-vat" name="vat_rate" inputMode="decimal" defaultValue={m(v.vat_rate)} />
      </Field>
      <Field label={t("storedPrices")} htmlFor="ps-incl">
        <NativeSelect id="ps-incl" name="prices_include_vat" defaultValue={String(v.prices_include_vat)}>
          <option value="true">{t("inclVat")}</option>
          <option value="false">{t("exclVat")}</option>
        </NativeSelect>
      </Field>
      <Field label={t("displayMode")} htmlFor="ps-display">
        <NativeSelect id="ps-display" name="display_mode" defaultValue={v.display_mode}>
          <option value="gross">{t("displayGross")}</option>
          <option value="net">{t("displayNet")}</option>
        </NativeSelect>
      </Field>
      <div className="flex justify-end sm:col-span-3">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

function PackageForm({ p, rooms, onDone }: { p: PackageRow | null; rooms: { id: string; name: string }[]; onDone: () => void }) {
  const t = useTranslations("admin.pricing");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [mode, setMode] = useState(p?.pricing_mode ?? "fixed");
  const [unit, setUnit] = useState(p?.duration_unit ?? (mode === "hourly_tiers" ? "hour" : "unspecified"));
  const { onSubmit, pending, fe, alert } = useAdminForm(savePricingPackage, p ? tc("updated") : tc("created"), () => {
    onDone();
    router.refresh();
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="package-form">
      <input type="hidden" name="id" value={p?.id ?? ""} />
      {alert}
      <LocaleTabs
        missing={{ en: !!p && !p.name_en }}
        de={
          <div className="space-y-3">
            <Field label={t("nameDe")} htmlFor="pk-name-de" error={fe("name_de")}>
              <Input
                id="pk-name-de"
                name="name_de"
                defaultValue={p?.name_de}
                maxLength={120}
                onBlur={(e) => {
                  const slug = e.currentTarget.form?.elements.namedItem("slug") as HTMLInputElement | null;
                  if (slug && !slug.value)
                    slug.value = e.currentTarget.value.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                }}
              />
            </Field>
            <Field label={t("descriptionDe")} htmlFor="pk-desc-de" error={fe("description_de")}>
              <Textarea id="pk-desc-de" name="description_de" defaultValue={p?.description_de} rows={2} maxLength={1000} />
            </Field>
          </div>
        }
        en={
          <div className="space-y-3">
            <Field label={t("nameEn")} htmlFor="pk-name-en" error={fe("name_en")}>
              <Input id="pk-name-en" name="name_en" defaultValue={p?.name_en} maxLength={120} />
            </Field>
            <Field label={t("descriptionEn")} htmlFor="pk-desc-en" error={fe("description_en")}>
              <Textarea id="pk-desc-en" name="description_en" defaultValue={p?.description_en} rows={2} maxLength={1000} />
            </Field>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("mode")} htmlFor="pk-mode">
          <NativeSelect id="pk-mode" name="pricing_mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            {["hourly_tiers", "fixed", "per_person"].map((x) => <option key={x} value={x}>{t(`modes.${x}`)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tc("slug")} htmlFor="pk-slug" error={fe("slug")}>
          <Input id="pk-slug" name="slug" defaultValue={p?.slug} maxLength={80} />
        </Field>
        {mode !== "hourly_tiers" ? (
          <Field label={mode === "per_person" ? t("pricePerPerson") : t("price")} htmlFor="pk-price" error={fe("price")} hint={t("moneyHint")}>
            <Input id="pk-price" name="price" inputMode="decimal" defaultValue={m(p?.price)} />
          </Field>
        ) : (
          <Field label={t("extraHourIncrement")} htmlFor="pk-inc" error={fe("extra_hour_increment")} hint={t("extraHourIncrementHint")}>
            <Input id="pk-inc" name="extra_hour_increment" inputMode="decimal" defaultValue={m(p?.extra_hour_increment ?? "1")} />
          </Field>
        )}
        {mode === "per_person" ? (
          <Field label={t("priceMax")} htmlFor="pk-price-max" error={fe("price_max")} hint={t("priceMaxHint")}>
            <Input id="pk-price-max" name="price_max" inputMode="decimal" defaultValue={m(p?.price_max)} />
          </Field>
        ) : null}
        {mode === "fixed" ? (
          <>
            <Field label={t("durationUnit")} htmlFor="pk-unit">
              <NativeSelect id="pk-unit" name="duration_unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {["unspecified", "hour", "half_day", "full_day", "custom"].map((x) => <option key={x} value={x}>{t(`units.${x}`)}</option>)}
              </NativeSelect>
            </Field>
            {["half_day", "full_day", "custom"].includes(unit) ? (
              <Field label={t("durationHours")} htmlFor="pk-unit-hours" error={fe("duration_hours")}>
                <Input id="pk-unit-hours" type="number" name="duration_hours" min={1} max={24} defaultValue={s(p?.duration_hours ?? (unit === "half_day" ? 4 : unit === "full_day" ? 8 : ""))} />
              </Field>
            ) : null}
          </>
        ) : (
          <input type="hidden" name="duration_unit" value={mode === "hourly_tiers" ? "hour" : "unspecified"} />
        )}
        <Field label={t("minHours")} htmlFor="pk-min-h" error={fe("min_hours")}>
          <Input id="pk-min-h" type="number" name="min_hours" min={1} max={24} defaultValue={p?.min_hours ?? 1} />
        </Field>
        <Field label={t("maxHours")} htmlFor="pk-max-h" error={fe("max_hours")}>
          <Input id="pk-max-h" type="number" name="max_hours" min={1} max={24} defaultValue={p?.max_hours ?? 10} />
        </Field>
        <Field label={t("minParticipants")} htmlFor="pk-min-p" error={fe("min_participants")}>
          <Input id="pk-min-p" type="number" name="min_participants" min={1} max={1000} defaultValue={p?.min_participants ?? 1} />
        </Field>
        <Field label={t("maxParticipants")} htmlFor="pk-max-p" error={fe("max_participants")} hint={t("emptyNoLimit")}>
          <Input id="pk-max-p" type="number" name="max_participants" min={1} max={1000} defaultValue={s(p?.max_participants)} />
        </Field>
        {mode !== "per_person" ? (
          <>
            <Field label={t("includedParticipants")} htmlFor="pk-incl-p" error={fe("included_participants")} hint={t("includedParticipantsHint")}>
              <Input id="pk-incl-p" type="number" name="included_participants" min={1} max={1000} defaultValue={s(p?.included_participants)} />
            </Field>
            <Field label={t("extraPersonPrice")} htmlFor="pk-extra" error={fe("extra_person_price")} hint={t("extraPersonPriceHint")}>
              <Input id="pk-extra" name="extra_person_price" inputMode="decimal" defaultValue={m(p?.extra_person_price)} />
            </Field>
          </>
        ) : null}
        <Field label={t("room")} htmlFor="pk-room" hint={t("roomHint")}>
          <NativeSelect id="pk-room" name="room_id" defaultValue={p?.room_id ?? ""}>
            <option value="">—</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tc("order")} htmlFor="pk-order" error={fe("sort_order")}>
          <Input id="pk-order" type="number" name="sort_order" min={0} max={9999} defaultValue={p?.sort_order ?? 100} />
        </Field>
      </div>
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="price_is_final" defaultChecked={p?.price_is_final ?? false} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>
            {t("priceIsFinal")}
            <span className="block text-xs text-muted-foreground">{t("priceIsFinalHint")}</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={p?.active ?? false} className="h-4 w-4 accent-primary" />
          {t("activeLabel")}
        </label>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

function TierRow({ packageId, tier, example }: { packageId: string; tier: PackageRow["tiers"][number]; example: string }) {
  const t = useTranslations("admin.pricing");
  const { onSubmit, pending, fe, alert } = useAdminForm(savePricingTier, t("tierSaved"));
  return (
    <li className="rounded-xl border bg-background p-3" data-testid={`tier-${tier.hours}`}>
      <form onSubmit={onSubmit} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-end gap-3 sm:grid-cols-[5rem_minmax(0,9rem)_minmax(0,1fr)_auto_auto]" noValidate>
        <input type="hidden" name="package_id" value={packageId} />
        <input type="hidden" name="hours" value={tier.hours} />
        <div className="pb-2 text-sm font-semibold">{t("hoursShort", { count: tier.hours })}</div>
        <Field label={t("hourlyRate")} htmlFor={`tier-${packageId}-${tier.hours}`} error={fe("hourly_rate")}>
          <Input id={`tier-${packageId}-${tier.hours}`} name="hourly_rate" inputMode="decimal" defaultValue={m(tier.hourly_rate)} />
        </Field>
        <p className="col-span-2 pb-2 text-xs text-muted-foreground sm:col-span-1">{example}</p>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={tier.active} className="h-4 w-4 accent-primary" />
          {t("tierActive")}
        </label>
        <div className="col-span-2 flex justify-end gap-2 sm:col-span-1">
          <SubmitButton pending={pending} size="sm" variant="outline" aria-label={t("saveTier", { count: tier.hours })}>
            <Save /> <span className="sm:sr-only">{t("saveTier", { count: tier.hours })}</span>
          </SubmitButton>
          <DeleteButton action={() => deletePricingTier(packageId, tier.hours)} name={t("hoursShort", { count: tier.hours })} label={t("deleteTier")} />
        </div>
      </form>
      {alert ? <div className="mt-2">{alert}</div> : null}
    </li>
  );
}

function NewTierForm({ packageId, used }: { packageId: string; used: number[] }) {
  const t = useTranslations("admin.pricing");
  const next = Array.from({ length: 24 }, (_, i) => i + 1).find((h) => !used.includes(h)) ?? 1;
  const { onSubmit, pending, fe, alert } = useAdminForm(savePricingTier, t("tierSaved"));
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-dashed p-3 sm:grid-cols-[8rem_minmax(0,9rem)_auto]" noValidate data-testid="new-tier-form">
      <input type="hidden" name="package_id" value={packageId} />
      <input type="hidden" name="active" value="on" />
      <Field label={t("duration")} htmlFor={`nt-h-${packageId}`} error={fe("hours")}>
        <Input id={`nt-h-${packageId}`} type="number" name="hours" min={1} max={24} defaultValue={next} key={next} />
      </Field>
      <Field label={t("hourlyRate")} htmlFor={`nt-r-${packageId}`} error={fe("hourly_rate")}>
        <Input id={`nt-r-${packageId}`} name="hourly_rate" inputMode="decimal" />
      </Field>
      <SubmitButton pending={pending} size="sm" className="col-span-2 sm:col-span-1">
        <Plus /> {t("addTier")}
      </SubmitButton>
      {alert ? <div className="col-span-2 sm:col-span-3">{alert}</div> : null}
    </form>
  );
}

export function PricingPackages({ rows, rooms, packages }: { rows: PackageRow[]; rooms: { id: string; name: string }[]; packages: PricingPackage[] }) {
  const t = useTranslations("admin.pricing");
  const tc = useTranslations("admin.common");
  const locale = useLocale() as "de" | "en";
  const errorText = useErrorText();
  const router = useRouter();
  const [editing, setEditing] = useState<PackageRow | null | "new">(null);
  const [, start] = useTransition();
  const f = (v: string | null) => (v === null ? "—" : formatCents(toCents(v) ?? 0, locale));

  const toggle = (p: PackageRow, active: boolean) =>
    start(async () => {
      const res = await setPricingPackageActive(p.id, active);
      if (!res.ok) toast.error(errorText(res.error));
      else {
        toast.success(active ? t("activated") : t("deactivated"));
        router.refresh();
      }
    });

  const summary = (p: PackageRow) => {
    const parts: string[] = [];
    if (p.pricing_mode === "fixed") parts.push(`${f(p.price)} · ${t(`units.${p.duration_unit}`)}${p.duration_hours ? ` (${t("hoursShort", { count: p.duration_hours })})` : ""}`);
    if (p.pricing_mode === "per_person") parts.push(p.price_max ? `${f(p.price)} – ${f(p.price_max)} ${t("perPersonShort")}` : `${f(p.price)} ${t("perPersonShort")}`);
    if (p.pricing_mode === "hourly_tiers") parts.push(t("tiersCount", { count: p.tiers.length }));
    parts.push(p.max_participants ? t("participantsRange", { min: p.min_participants, max: p.max_participants }) : t("participantsFrom", { min: p.min_participants }));
    parts.push(t("hoursRange", { min: p.min_hours, max: p.max_hours }));
    if (p.extra_person_price && p.included_participants) parts.push(t("extraSummary", { price: f(p.extra_person_price), count: p.included_participants }));
    return parts.join(" · ");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")} data-testid="new-package">
          <Plus /> {t("newPackage")}
        </Button>
      </div>
      <ul className="space-y-4" data-testid="package-list">
        {rows.map((p) => {
          const calc = packages.find((x) => x.id === p.id);
          return (
            <li key={p.id}>
              <Card data-testid={`package-${p.slug}`}>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {locale === "de" ? p.name_de : p.name_en}
                      <Badge variant="secondary">{t(`modes.${p.pricing_mode}`)}</Badge>
                      {p.active ? <Badge variant="success">{t("active")}</Badge> : <Badge variant="muted">{t("inactive")}</Badge>}
                      {p.price_is_final ? <Badge variant="info">{t("finalBadge")}</Badge> : null}
                    </CardTitle>
                    <CardDescription className="mt-1">{summary(p)}</CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch checked={p.active} onCheckedChange={(v) => toggle(p, v)} aria-label={t("activeLabel")} />
                    <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                      <Pencil /> {tc("edit")}
                    </Button>
                    <DeleteButton action={() => deletePricingPackage(p.id)} name={locale === "de" ? p.name_de : p.name_en} description={t("deleteHint")} />
                  </div>
                </CardHeader>
                {p.pricing_mode === "hourly_tiers" ? (
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{t("tiersHint")}</p>
                    <ul className="space-y-2">
                      {p.tiers.map((tier) => {
                        const rate = toCents(tier.hourly_rate) ?? 0;
                        return (
                          <TierRow
                            key={`${tier.hours}-${tier.hourly_rate}-${tier.active}`}
                            packageId={p.id}
                            tier={tier}
                            example={t("tierExample", { hours: tier.hours, rate: formatCents(rate, locale), total: formatCents(rate * tier.hours, locale) })}
                          />
                        );
                      })}
                    </ul>
                    <NewTierForm packageId={p.id} used={p.tiers.map((x) => x.hours)} />
                    {calc && p.tiers.length && p.max_hours > Math.max(...p.tiers.map((x) => x.hours)) ? (
                      <p className="text-xs text-muted-foreground">
                        {t("beyondTiers", {
                          list: Array.from({ length: p.max_hours - Math.max(...p.tiers.map((x) => x.hours)) }, (_, i) => Math.max(...p.tiers.map((x) => x.hours)) + i + 1)
                            .map((h) => `${t("hoursShort", { count: h })}: ${formatCents(hourlyRate(calc, h) ?? 0, locale)}`)
                            .join(" · "),
                        })}
                      </p>
                    ) : null}
                  </CardContent>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent closeLabel={tc("close")} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("newPackage") : t("editPackage")}</DialogTitle>
            <DialogDescription>{t("packageHint")}</DialogDescription>
          </DialogHeader>
          {editing !== null ? <PackageForm p={editing === "new" ? null : editing} rooms={rooms} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
