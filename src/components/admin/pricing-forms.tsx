"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Save } from "lucide-react";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { useAdminForm } from "./people-forms";
import { LocaleTabs } from "./locale-tabs";
import { DeleteButton } from "./delete-button";
import {
  deletePricePackage,
  deletePricingPlan,
  deletePricingTier,
  savePricePackage,
  savePricingPlan,
  savePricingSettings,
  savePricingTier,
} from "@/lib/admin/pricing";
import { formatCents, hourlyRateCents, toCents, type HourlyPlan, type PricePackage, type PricingSettings } from "@/lib/pricing/calc";
import type { Locale } from "@/i18n/routing";

export type RoomOption = { id: string; name: string; capacity: number };

const dec = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-primary" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

export function TaxSettingsForm({ v }: { v: PricingSettings }) {
  const t = useTranslations("admin.pricing");
  const tc = useTranslations("admin.common");
  const { onSubmit, pending, fe, alert } = useAdminForm(savePricingSettings, t("saved"));
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="tax-settings">
      {alert}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("vatRate")} htmlFor="tx-vat" error={fe("vat_rate")}>
          <Input id="tx-vat" name="vat_rate" inputMode="decimal" defaultValue={dec(v.vatRate)} />
        </Field>
        <Field label={t("storedPrices")} htmlFor="tx-incl">
          <NativeSelect id="tx-incl" name="prices_include_vat" defaultValue={v.pricesIncludeVat ? "true" : "false"}>
            <option value="true">{t("storedGross")}</option>
            <option value="false">{t("storedNet")}</option>
          </NativeSelect>
        </Field>
        <Field label={t("displayMode")} htmlFor="tx-display">
          <NativeSelect id="tx-display" name="display_mode" defaultValue={v.displayMode}>
            <option value="gross">{t("displayGross")}</option>
            <option value="net">{t("displayNet")}</option>
          </NativeSelect>
        </Field>
      </div>
      <Check name="show_vat_breakdown" label={t("showBreakdown")} defaultChecked={v.showVatBreakdown} />
      <div>
        <div className="mb-2 text-sm font-medium">{t("publicNote")}</div>
        <LocaleTabs
          de={<Textarea name="note_de" defaultValue={v.noteDe} rows={2} maxLength={1000} aria-label={`${t("publicNote")} (DE)`} />}
          en={<Textarea name="note_en" defaultValue={v.noteEn} rows={2} maxLength={1000} aria-label={`${t("publicNote")} (EN)`} />}
        />
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

function NameFields({ fe, v, prefix }: { fe: (k: string) => string | undefined; v: { nameDe: string; nameEn: string; descriptionDe: string; descriptionEn: string }; prefix: string }) {
  const t = useTranslations("admin.pricing");
  const pane = (l: "de" | "en") => (
    <div className="grid gap-3">
      <Field label={t("name")} htmlFor={`${prefix}-name-${l}`} error={fe(`name_${l}`)}>
        <Input id={`${prefix}-name-${l}`} name={`name_${l}`} defaultValue={l === "de" ? v.nameDe : v.nameEn} maxLength={120} />
      </Field>
      <Field label={t("description")} htmlFor={`${prefix}-desc-${l}`}>
        <Textarea id={`${prefix}-desc-${l}`} name={`description_${l}`} defaultValue={l === "de" ? v.descriptionDe : v.descriptionEn} rows={2} maxLength={1000} />
      </Field>
    </div>
  );
  return <LocaleTabs de={pane("de")} en={pane("en")} missing={{ en: !v.nameEn }} />;
}

function RoomSelect({ id, rooms, value }: { id: string; rooms: RoomOption[]; value: string | null }) {
  const t = useTranslations("admin.pricing");
  return (
    <NativeSelect id={id} name="room_id" defaultValue={value ?? ""}>
      <option value="">{t("noRoom")}</option>
      {rooms.map((r) => (
        <option key={r.id} value={r.id}>{r.name} ({r.capacity})</option>
      ))}
    </NativeSelect>
  );
}

const emptyPlan: HourlyPlan = {
  id: "", nameDe: "", nameEn: "", descriptionDe: "", descriptionEn: "", roomId: null, minParticipants: 1, maxParticipants: 10,
  minHours: 1, maxHours: 12, extraHourIncrement: 0, priceType: "fixed", active: true, displayOrder: 0, tiers: [],
};

/** Settings of an hourly plan (limits, increment, status). */
export function PlanForm({ plan = emptyPlan, rooms, onDone }: { plan?: HourlyPlan; rooms: RoomOption[]; onDone?: () => void }) {
  const t = useTranslations("admin.pricing");
  const tc = useTranslations("admin.common");
  const { onSubmit, pending, fe, alert } = useAdminForm(savePricingPlan, t("saved"), onDone ? () => onDone() : undefined);
  const p = plan.id || "new";
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid={`plan-form-${p}`}>
      {plan.id ? <input type="hidden" name="id" value={plan.id} /> : null}
      {alert}
      <NameFields fe={fe} v={plan} prefix={`pl-${p}`} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t("minParticipants")} htmlFor={`pl-${p}-minp`} error={fe("min_participants")}>
          <Input id={`pl-${p}-minp`} name="min_participants" type="number" min={1} max={1000} defaultValue={plan.minParticipants} />
        </Field>
        <Field label={t("maxParticipants")} htmlFor={`pl-${p}-maxp`} error={fe("max_participants")}>
          <Input id={`pl-${p}-maxp`} name="max_participants" type="number" min={1} max={1000} defaultValue={plan.maxParticipants} />
        </Field>
        <Field label={t("minHours")} htmlFor={`pl-${p}-minh`} error={fe("min_hours")}>
          <Input id={`pl-${p}-minh`} name="min_hours" type="number" min={1} max={24} defaultValue={plan.minHours} />
        </Field>
        <Field label={t("maxHours")} htmlFor={`pl-${p}-maxh`} error={fe("max_hours")}>
          <Input id={`pl-${p}-maxh`} name="max_hours" type="number" min={1} max={24} defaultValue={plan.maxHours} />
        </Field>
        <Field label={t("increment")} htmlFor={`pl-${p}-inc`} error={fe("extra_hour_increment")} hint={t("incrementHint")} className="sm:col-span-2">
          <Input id={`pl-${p}-inc`} name="extra_hour_increment" inputMode="decimal" defaultValue={dec(plan.extraHourIncrement)} />
        </Field>
        <Field label={t("priceType")} htmlFor={`pl-${p}-type`}>
          <NativeSelect id={`pl-${p}-type`} name="price_type" defaultValue={plan.priceType}>
            <option value="fixed">{t("priceTypeFixed")}</option>
            <option value="estimate">{t("priceTypeEstimate")}</option>
          </NativeSelect>
        </Field>
        <Field label={t("order")} htmlFor={`pl-${p}-order`} error={fe("display_order")} hint={t("orderHint")}>
          <Input id={`pl-${p}-order`} name="display_order" type="number" defaultValue={plan.displayOrder} />
        </Field>
        <Field label={t("room")} htmlFor={`pl-${p}-room`} className="sm:col-span-2">
          <RoomSelect id={`pl-${p}-room`} rooms={rooms} value={plan.roomId} />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Check name="active" label={t("activeLabel")} defaultChecked={plan.active} hint={t("activeHint")} />
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

function TierRow({ tier, planId }: { tier: { id: string; hours: number; hourlyRate: number; active: boolean }; planId: string }) {
  const t = useTranslations("admin.pricing");
  const locale = useLocale() as Locale;
  const { onSubmit, pending, fe } = useAdminForm(savePricingTier, t("saved"));
  const [rate, setRate] = useState(dec(tier.hourlyRate));
  let total = "";
  try {
    total = formatCents(toCents(rate.replace(",", ".")) * tier.hours, locale);
  } catch {
    total = "–";
  }
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-[4rem_1fr_auto] items-start gap-2 border-b py-2 last:border-0 sm:grid-cols-[4.5rem_minmax(0,8rem)_minmax(0,7rem)_auto_auto]" data-testid={`tier-${tier.hours}`} noValidate>
      <input type="hidden" name="id" value={tier.id} />
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="hours" value={tier.hours} />
      <span className="pt-2 text-sm font-medium">{t("hoursCount", { count: tier.hours })}</span>
      <div>
        <Input name="hourly_rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-label={t("hourlyRateFor", { hours: tier.hours })} aria-invalid={!!fe("hourly_rate")} />
        {fe("hourly_rate") ? <p className="mt-1 text-xs text-destructive">{fe("hourly_rate")}</p> : null}
      </div>
      <span className="hidden pt-2 text-sm tabular-nums text-muted-foreground sm:block" data-testid="tier-total">= {total}</span>
      <label className="flex items-center gap-1.5 pt-2 text-xs">
        <input type="checkbox" name="active" defaultChecked={tier.active} className="h-4 w-4 accent-primary" /> {t("activeShort")}
      </label>
      <div className="col-span-3 flex gap-2 sm:col-span-1">
        <SubmitButton pending={pending} size="sm" variant="outline" aria-label={t("saveTier", { hours: tier.hours })}>
          <Save />
        </SubmitButton>
        <DeleteButton
          name={t("hoursCount", { count: tier.hours })}
          label=""
          action={() => {
            const fd = new FormData();
            fd.set("id", tier.id);
            return deletePricingTier(null, fd);
          }}
        />
      </div>
    </form>
  );
}

function AddTierForm({ planId, nextHours }: { planId: string; nextHours: number }) {
  const t = useTranslations("admin.pricing");
  const { onSubmit, pending, fe, alert } = useAdminForm(savePricingTier, t("saved"));
  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3" noValidate data-testid="add-tier">
      {alert}
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="active" value="on" />
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[8rem_10rem_auto]">
        <Field label={t("duration")} htmlFor={`at-${planId}-h`} error={fe("hours")}>
          <Input id={`at-${planId}-h`} name="hours" type="number" min={1} max={24} defaultValue={nextHours} />
        </Field>
        <Field label={t("hourlyRate")} htmlFor={`at-${planId}-r`} error={fe("hourly_rate")}>
          <Input id={`at-${planId}-r`} name="hourly_rate" inputMode="decimal" />
        </Field>
        <SubmitButton pending={pending} size="sm" variant="outline" className="col-span-2 sm:col-span-1">
          <Plus /> {t("addTier")}
        </SubmitButton>
      </div>
    </form>
  );
}

/** One hourly plan: its settings, the duration tiers and a short example. */
export function PlanCard({ plan, rooms }: { plan: HourlyPlan; rooms: RoomOption[] }) {
  const t = useTranslations("admin.pricing");
  const locale = useLocale() as Locale;
  const [edit, setEdit] = useState(false);
  const longest = plan.tiers.length ? plan.tiers[plan.tiers.length - 1].hours : 0;
  const example = longest && longest < plan.maxHours ? hourlyRateCents(plan, longest + 1) : null;
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6" data-testid="admin-plan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {locale === "de" ? plan.nameDe : plan.nameEn}
            <Badge variant={plan.active ? "success" : "muted"}>{plan.active ? t("active") : t("inactive")}</Badge>
            <Badge variant={plan.priceType === "fixed" ? "secondary" : "warning"}>{plan.priceType === "fixed" ? t("priceTypeFixed") : t("priceTypeEstimate")}</Badge>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("planSummary", { minP: plan.minParticipants, maxP: plan.maxParticipants, minH: plan.minHours, maxH: plan.maxHours })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEdit((x) => !x)} aria-expanded={edit}>
            <Pencil /> {t("editSettings")}
          </Button>
          <DeleteButton
            name={plan.nameDe}
            description={t("deletePlanHint")}
            action={() => {
              const fd = new FormData();
              fd.set("id", plan.id);
              return deletePricingPlan(null, fd);
            }}
          />
        </div>
      </div>
      {edit ? (
        <div className="mt-4 border-t pt-4">
          <PlanForm plan={plan} rooms={rooms} />
        </div>
      ) : null}
      <div className="mt-4 border-t pt-3">
        <div className="hidden grid-cols-[4.5rem_minmax(0,8rem)_minmax(0,7rem)_auto_auto] gap-2 pb-1 text-xs font-medium text-muted-foreground sm:grid">
          <span>{t("duration")}</span>
          <span>{t("hourlyRate")} (€)</span>
          <span>{t("total")}</span>
        </div>
        {plan.tiers.length ? plan.tiers.map((tier) => <TierRow key={`${tier.id}-${tier.hourlyRate}-${tier.active}`} tier={tier} planId={plan.id} />) : <p className="py-2 text-sm text-muted-foreground">{t("noTiers")}</p>}
        {example !== null ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("incrementExample", { hours: longest + 1, rate: formatCents(example, locale) })}</p>
        ) : null}
        <AddTierForm planId={plan.id} nextHours={Math.min(24, longest + 1 || 1)} />
      </div>
    </div>
  );
}

export function NewPlanDialog({ rooms }: { rooms: RoomOption[] }) {
  const t = useTranslations("admin.pricing");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus /> {t("newPlan")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("newPlan")}</DialogTitle>
        </DialogHeader>
        <PlanForm rooms={rooms} onDone={() => { setOpen(false); location.reload(); }} />
      </DialogContent>
    </Dialog>
  );
}

const emptyPackage: PricePackage = {
  id: "", nameDe: "", nameEn: "", descriptionDe: "", descriptionEn: "", roomId: null, pricingMode: "flat", price: 0, durationType: "custom",
  durationHours: null, durationLabelDe: "", durationLabelEn: "", minParticipants: 1, maxParticipants: null, extraPersonPrice: null,
  maxExtraParticipants: null, priceType: "estimate", active: true, displayOrder: 100,
};

function PackageForm({ pkg, rooms, onDone }: { pkg: PricePackage; rooms: RoomOption[]; onDone: () => void }) {
  const t = useTranslations("admin.pricing");
  const tc = useTranslations("admin.common");
  const { onSubmit, pending, fe, alert } = useAdminForm(savePricePackage, t("saved"), () => onDone());
  const p = pkg.id || "new";
  const labelPane = (l: "de" | "en") => (
    <Field label={t("durationLabel")} htmlFor={`pk-${p}-dl-${l}`} hint={t("durationLabelHint")}>
      <Input id={`pk-${p}-dl-${l}`} name={`duration_label_${l}`} defaultValue={l === "de" ? pkg.durationLabelDe : pkg.durationLabelEn} maxLength={120} />
    </Field>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid={`package-form-${p}`}>
      {pkg.id ? <input type="hidden" name="id" value={pkg.id} /> : null}
      {alert}
      <NameFields fe={fe} v={pkg} prefix={`pk-${p}`} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("price")} htmlFor={`pk-${p}-price`} error={fe("price")}>
          <Input id={`pk-${p}-price`} name="price" inputMode="decimal" defaultValue={pkg.id ? dec(pkg.price) : ""} />
        </Field>
        <Field label={t("pricingMode")} htmlFor={`pk-${p}-mode`}>
          <NativeSelect id={`pk-${p}-mode`} name="pricing_mode" defaultValue={pkg.pricingMode}>
            <option value="flat">{t("modeFlat")}</option>
            <option value="per_person">{t("modePerPerson")}</option>
          </NativeSelect>
        </Field>
        <Field label={t("priceType")} htmlFor={`pk-${p}-type`}>
          <NativeSelect id={`pk-${p}-type`} name="price_type" defaultValue={pkg.priceType}>
            <option value="estimate">{t("priceTypeEstimate")}</option>
            <option value="fixed">{t("priceTypeFixed")}</option>
          </NativeSelect>
        </Field>
        <Field label={t("durationType")} htmlFor={`pk-${p}-dt`}>
          <NativeSelect id={`pk-${p}-dt`} name="duration_type" defaultValue={pkg.durationType}>
            {(["hour", "half_day", "full_day", "custom"] as const).map((d) => (
              <option key={d} value={d}>{t(`durationTypes.${d}`)}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("durationHours")} htmlFor={`pk-${p}-dh`} error={fe("duration_hours")} hint={t("durationHoursHint")} className="sm:col-span-2">
          <Input id={`pk-${p}-dh`} name="duration_hours" inputMode="decimal" defaultValue={dec(pkg.durationHours)} />
        </Field>
        <Field label={t("minParticipants")} htmlFor={`pk-${p}-minp`} error={fe("min_participants")}>
          <Input id={`pk-${p}-minp`} name="min_participants" type="number" min={1} max={1000} defaultValue={pkg.minParticipants} />
        </Field>
        <Field label={t("capacity")} htmlFor={`pk-${p}-maxp`} error={fe("max_participants")} hint={t("capacityHint")}>
          <Input id={`pk-${p}-maxp`} name="max_participants" type="number" min={1} max={1000} defaultValue={dec(pkg.maxParticipants)} />
        </Field>
        <Field label={t("room")} htmlFor={`pk-${p}-room`}>
          <RoomSelect id={`pk-${p}-room`} rooms={rooms} value={pkg.roomId} />
        </Field>
        <Field label={t("extraPersonPrice")} htmlFor={`pk-${p}-extra`} error={fe("extra_person_price")} hint={t("extraPersonHint")}>
          <Input id={`pk-${p}-extra`} name="extra_person_price" inputMode="decimal" defaultValue={dec(pkg.extraPersonPrice)} />
        </Field>
        <Field label={t("maxExtra")} htmlFor={`pk-${p}-maxextra`} error={fe("max_extra_participants")} hint={t("maxExtraHint")}>
          <Input id={`pk-${p}-maxextra`} name="max_extra_participants" type="number" min={1} max={1000} defaultValue={dec(pkg.maxExtraParticipants)} />
        </Field>
        <Field label={t("order")} htmlFor={`pk-${p}-order`} error={fe("display_order")} hint={t("orderHint")}>
          <Input id={`pk-${p}-order`} name="display_order" type="number" defaultValue={pkg.displayOrder} />
        </Field>
      </div>
      <LocaleTabs de={labelPane("de")} en={labelPane("en")} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Check name="active" label={t("activeLabel")} defaultChecked={pkg.active} hint={t("activeHint")} />
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

export function PackageDialog({ pkg, rooms }: { pkg?: PricePackage; rooms: RoomOption[] }) {
  const t = useTranslations("admin.pricing");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {pkg ? (
          <Button size="sm" variant="outline" data-testid="edit-package"><Pencil /> {t("edit")}</Button>
        ) : (
          <Button variant="outline"><Plus /> {t("newPackage")}</Button>
        )}
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pkg ? pkg.nameDe : t("newPackage")}</DialogTitle>
        </DialogHeader>
        <PackageForm pkg={pkg ?? emptyPackage} rooms={rooms} onDone={() => { setOpen(false); location.reload(); }} />
      </DialogContent>
    </Dialog>
  );
}

export function PackageCard({ pkg, rooms }: { pkg: PricePackage; rooms: RoomOption[] }) {
  const t = useTranslations("admin.pricing");
  const locale = useLocale() as Locale;
  const room = rooms.find((r) => r.id === pkg.roomId);
  return (
    <div className="flex flex-col rounded-2xl border bg-card p-5 shadow-xs" data-testid="admin-package">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{locale === "de" ? pkg.nameDe : pkg.nameEn}</h3>
        <Badge variant={pkg.active ? "success" : "muted"}>{pkg.active ? t("active") : t("inactive")}</Badge>
        <Badge variant={pkg.priceType === "fixed" ? "secondary" : "warning"}>{pkg.priceType === "fixed" ? t("priceTypeFixed") : t("priceTypeEstimate")}</Badge>
      </div>
      <p className="mt-2 text-xl font-bold">
        {formatCents(toCents(pkg.price), locale)}{" "}
        <span className="text-sm font-medium text-muted-foreground">{pkg.pricingMode === "per_person" ? t("perPerson") : t(`durationTypes.${pkg.durationType}`)}</span>
      </p>
      <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
        <li>{pkg.maxParticipants ? t("upTo", { count: pkg.maxParticipants }) : t("noCapacity")}</li>
        {pkg.extraPersonPrice !== null ? <li>{t("extraSummary", { price: formatCents(toCents(pkg.extraPersonPrice), locale) })}</li> : null}
        {pkg.durationHours !== null ? <li>{t("coversHours", { hours: pkg.durationHours })}</li> : null}
        {room ? <li>{t("room")}: {room.name}</li> : null}
      </ul>
      <div className="mt-auto flex gap-2 pt-4">
        <PackageDialog pkg={pkg} rooms={rooms} />
        <DeleteButton
          name={pkg.nameDe}
          action={() => {
            const fd = new FormData();
            fd.set("id", pkg.id);
            return deletePricePackage(null, fd);
          }}
        />
      </div>
    </div>
  );
}
