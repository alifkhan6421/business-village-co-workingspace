/**
 * Pricing engine shared by the public calculator (live preview) and the
 * server (authoritative recalculation on submit and in the admin panel).
 *
 * All money is handled as integer cents; database numerics are converted with
 * toCents() and never multiplied as floats. VAT is handled in basis points.
 */
import type { Locale } from "@/i18n/routing";

export type PricingSettings = {
  vatRate: number; // e.g. 19 or 7.5
  pricesIncludeVat: boolean;
  displayMode: "gross" | "net";
  showVatBreakdown: boolean;
  noteDe: string;
  noteEn: string;
};

export type HourlyTier = { id: string; hours: number; hourlyRate: number; active: boolean };

export type HourlyPlan = {
  id: string;
  nameDe: string;
  nameEn: string;
  descriptionDe: string;
  descriptionEn: string;
  roomId: string | null;
  minParticipants: number;
  maxParticipants: number;
  minHours: number;
  maxHours: number;
  extraHourIncrement: number;
  priceType: "fixed" | "estimate";
  active: boolean;
  displayOrder: number;
  tiers: HourlyTier[];
};

export type PricePackage = {
  id: string;
  nameDe: string;
  nameEn: string;
  descriptionDe: string;
  descriptionEn: string;
  roomId: string | null;
  pricingMode: "flat" | "per_person";
  price: number;
  durationType: "hour" | "half_day" | "full_day" | "custom";
  durationHours: number | null;
  durationLabelDe: string;
  durationLabelEn: string;
  minParticipants: number;
  maxParticipants: number | null;
  extraPersonPrice: number | null;
  maxExtraParticipants: number | null;
  priceType: "fixed" | "estimate";
  active: boolean;
  displayOrder: number;
};

export type PricingConfig = { settings: PricingSettings; plans: HourlyPlan[]; packages: PricePackage[] };

export type PriceInput = { hours: number; participants: number };

export type PriceLine = { code: "hourly" | "package" | "per_person" | "extra_person"; quantity: number; unitCents: number; totalCents: number };

export type Estimate = {
  option: { key: string; kind: "plan" | "package"; id: string; nameDe: string; nameEn: string; priceType: "fixed" | "estimate" };
  input: PriceInput;
  lines: PriceLine[];
  /** Hourly rate applied for the duration (hourly plans only). */
  hourlyRateCents: number | null;
  vatRate: number;
  pricesIncludeVat: boolean;
  netCents: number;
  vatCents: number;
  grossCents: number;
};

/** Parses a decimal amount (number or numeric string from Postgres) into integer cents without float arithmetic. */
export function toCents(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const s = typeof value === "number" ? value.toFixed(6) : String(value).trim();
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error(`invalid amount: ${value}`);
  const frac = (m[3] ?? "").padEnd(3, "0");
  // Round half up on the third decimal.
  let cents = Number(m[2]) * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  if (m[1] === "-") cents = -cents;
  return cents;
}

/** Integer cents → "248.00" (string for numeric columns). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Rounded integer division (half away from zero) for non-negative operands. */
function divRound(numerator: number, denominator: number) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** VAT rate (percent, max. two decimals) → basis points (19 → 1900). */
export function vatBasisPoints(rate: number) {
  return toCents(rate);
}

/** Splits a total into net, VAT and gross according to the tax settings. */
export function splitVat(totalCents: number, settings: Pick<PricingSettings, "vatRate" | "pricesIncludeVat">) {
  const bp = vatBasisPoints(settings.vatRate);
  if (settings.pricesIncludeVat) {
    const net = divRound(totalCents * 10000, 10000 + bp);
    return { netCents: net, vatCents: totalCents - net, grossCents: totalCents };
  }
  const vat = divRound(totalCents * bp, 10000);
  return { netCents: totalCents, vatCents: vat, grossCents: totalCents + vat };
}

/** Hourly rate for a duration: exact tier, otherwise the longest shorter tier plus the increment per extra hour. */
export function hourlyRateCents(plan: HourlyPlan, hours: number): number | null {
  const tiers = plan.tiers.filter((t) => t.active).sort((a, b) => a.hours - b.hours);
  if (!tiers.length) return null;
  const exact = tiers.find((t) => t.hours === hours);
  if (exact) return toCents(exact.hourlyRate);
  const lower = [...tiers].reverse().find((t) => t.hours < hours);
  if (!lower) return toCents(tiers[0].hourlyRate);
  return toCents(lower.hourlyRate) + toCents(plan.extraHourIncrement) * (hours - lower.hours);
}

export function planApplies(plan: HourlyPlan, input: PriceInput) {
  return (
    plan.active &&
    input.participants >= plan.minParticipants &&
    input.participants <= plan.maxParticipants &&
    input.hours >= plan.minHours &&
    input.hours <= plan.maxHours &&
    plan.tiers.some((t) => t.active)
  );
}

export function packageApplies(pkg: PricePackage, input: PriceInput) {
  if (!pkg.active || input.participants < pkg.minParticipants) return false;
  if (pkg.durationType !== "hour" && pkg.durationHours !== null && input.hours > pkg.durationHours) return false;
  if (pkg.maxParticipants !== null && input.participants > pkg.maxParticipants) {
    if (pkg.extraPersonPrice === null) return false;
    const extra = input.participants - pkg.maxParticipants;
    if (pkg.maxExtraParticipants !== null && extra > pkg.maxExtraParticipants) return false;
  }
  return true;
}

function finish(option: Estimate["option"], input: PriceInput, lines: PriceLine[], rate: number | null, settings: PricingSettings): Estimate {
  const total = lines.reduce((sum, l) => sum + l.totalCents, 0);
  return { option, input, lines, hourlyRateCents: rate, vatRate: settings.vatRate, pricesIncludeVat: settings.pricesIncludeVat, ...splitVat(total, settings) };
}

export function estimatePlan(plan: HourlyPlan, input: PriceInput, settings: PricingSettings): Estimate | null {
  if (!planApplies(plan, input)) return null;
  const rate = hourlyRateCents(plan, input.hours);
  if (rate === null) return null;
  return finish(
    { key: `plan:${plan.id}`, kind: "plan", id: plan.id, nameDe: plan.nameDe, nameEn: plan.nameEn, priceType: plan.priceType },
    input,
    [{ code: "hourly", quantity: input.hours, unitCents: rate, totalCents: rate * input.hours }],
    rate,
    settings,
  );
}

export function estimatePackage(pkg: PricePackage, input: PriceInput, settings: PricingSettings): Estimate | null {
  if (!packageApplies(pkg, input)) return null;
  const price = toCents(pkg.price);
  const periods = pkg.durationType === "hour" ? input.hours : 1;
  const lines: PriceLine[] = [];
  if (pkg.pricingMode === "per_person") {
    lines.push({ code: "per_person", quantity: input.participants * periods, unitCents: price, totalCents: price * input.participants * periods });
  } else {
    lines.push({ code: "package", quantity: periods, unitCents: price, totalCents: price * periods });
    if (pkg.maxParticipants !== null && input.participants > pkg.maxParticipants && pkg.extraPersonPrice !== null) {
      const extra = input.participants - pkg.maxParticipants;
      const unit = toCents(pkg.extraPersonPrice);
      lines.push({ code: "extra_person", quantity: extra, unitCents: unit, totalCents: unit * extra });
    }
  }
  return finish(
    { key: `package:${pkg.id}`, kind: "package", id: pkg.id, nameDe: pkg.nameDe, nameEn: pkg.nameEn, priceType: pkg.priceType },
    input,
    lines,
    null,
    settings,
  );
}

export function validInput(input: PriceInput) {
  return Number.isInteger(input.hours) && Number.isInteger(input.participants) && input.hours >= 1 && input.hours <= 24 && input.participants >= 1 && input.participants <= 1000;
}

/**
 * Every pricing option that applies to the input, in the administrator's
 * display order (hourly plans and packages share one order). The first entry
 * is the default category; e.g. more than 10 people skip the small-room plan
 * and fall through to the first fitting room package.
 */
export function applicableEstimates(config: PricingConfig, input: PriceInput): Estimate[] {
  if (!validInput(input)) return [];
  const items: { order: number; kind: number; estimate: Estimate | null }[] = [
    ...config.plans.map((p) => ({ order: p.displayOrder, kind: 0, estimate: estimatePlan(p, input, config.settings) })),
    ...config.packages.map((p) => ({ order: p.displayOrder, kind: 1, estimate: estimatePackage(p, input, config.settings) })),
  ];
  return items
    .filter((i): i is { order: number; kind: number; estimate: Estimate } => i.estimate !== null)
    .sort((a, b) => a.order - b.order || a.kind - b.kind)
    .map((i) => i.estimate);
}

/** The estimate for the chosen category, or the default one when it does not apply. */
export function computeEstimate(config: PricingConfig, input: PriceInput, optionKey?: string | null): Estimate | null {
  const all = applicableEstimates(config, input);
  return all.find((e) => e.option.key === optionKey) ?? all[0] ?? null;
}

export function optionName(option: { nameDe: string; nameEn: string }, locale: Locale) {
  return locale === "de" ? option.nameDe : option.nameEn || option.nameDe;
}

export function formatCents(cents: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** Snapshot stored with a booking request so historical prices never change. */
export function estimateSnapshot(estimate: Estimate, config: PricingConfig) {
  const rule =
    estimate.option.kind === "plan"
      ? config.plans.find((p) => p.id === estimate.option.id)
      : config.packages.find((p) => p.id === estimate.option.id);
  return {
    version: 1,
    calculatedAt: new Date().toISOString(),
    option: estimate.option,
    input: estimate.input,
    lines: estimate.lines,
    hourlyRateCents: estimate.hourlyRateCents,
    vatRate: estimate.vatRate,
    pricesIncludeVat: estimate.pricesIncludeVat,
    netCents: estimate.netCents,
    vatCents: estimate.vatCents,
    grossCents: estimate.grossCents,
    rule: rule ?? null,
  };
}
export type EstimateSnapshot = ReturnType<typeof estimateSnapshot>;
