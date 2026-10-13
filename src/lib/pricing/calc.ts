/**
 * Price calculation for meeting room requests. Pure and client-safe: the
 * public calculator shows a live estimate with it, and the server runs the
 * same code again on submission (client totals are never trusted).
 *
 * All money is integer euro cents and the VAT rate is integer basis points
 * (19.00 % = 1900), so no floating-point arithmetic touches a total.
 */

export type PricingMode = "hourly_tiers" | "fixed" | "per_person";
export type DurationUnit = "hour" | "half_day" | "full_day" | "custom" | "unspecified";

export type PricingTier = { hours: number; rateCents: number; active: boolean };

export type PricingPackage = {
  id: string;
  slug: string;
  nameDe: string;
  nameEn: string;
  descriptionDe: string;
  descriptionEn: string;
  mode: PricingMode;
  priceCents: number | null;
  priceMaxCents: number | null;
  durationUnit: DurationUnit;
  durationHours: number | null;
  minHours: number;
  maxHours: number;
  extraHourIncrementCents: number;
  minParticipants: number;
  maxParticipants: number | null;
  includedParticipants: number | null;
  extraPersonPriceCents: number | null;
  roomId: string | null;
  priceIsFinal: boolean;
  active: boolean;
  sortOrder: number;
  tiers: PricingTier[];
};

export type PricingSettings = { vatBasisPoints: number; pricesIncludeVat: boolean; displayMode: "gross" | "net" };
export type PricingConfig = { settings: PricingSettings; packages: PricingPackage[] };

export type QuoteLine =
  | { kind: "hourly"; hours: number; rateCents: number; amountCents: number }
  | { kind: "fixed"; units: number; unit: DurationUnit; unitHours: number | null; priceCents: number; amountCents: number }
  | { kind: "per_person"; participants: number; priceCents: number; amountCents: number; maxAmountCents: number | null }
  | { kind: "extra_persons"; persons: number; priceCents: number; amountCents: number };

export type Quote = {
  packageId: string;
  packageSlug: string;
  packageName: { de: string; en: string };
  mode: PricingMode;
  /** "package": admin marked the price as final; "estimate": subject to confirmation. */
  kind: "estimate" | "package";
  hours: number;
  participants: number;
  lines: QuoteLine[];
  netCents: number;
  vatCents: number;
  grossCents: number;
  /** Upper end of a price range (per-person packages with a maximum price). */
  maxGrossCents: number | null;
  vatBasisPoints: number;
  pricesIncludeVat: boolean;
  /** The rental period of a fixed package has not been set yet. */
  periodUnconfirmed: boolean;
};

export type QuoteError = "hours_out_of_range" | "participants_out_of_range" | "no_rate" | "no_price";
export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: QuoteError };

/** "31", "31.5", "31.50" (numeric from Postgres, as string or number) → 3150. */
export function toCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const s = typeof value === "number" ? value.toFixed(2) : String(value).trim();
  const m = s.match(/^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/);
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

/** 3150 → "31.50" for numeric database columns. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Integer division rounded half up (non-negative inputs). */
function roundDiv(a: number, b: number) {
  return Math.floor((2 * a + b) / (2 * b));
}

/** Splits an amount into net / VAT / gross depending on whether stored prices include VAT. */
export function splitVat(amountCents: number, settings: PricingSettings) {
  const bp = settings.vatBasisPoints;
  if (settings.pricesIncludeVat) {
    const net = roundDiv(amountCents * 10000, 10000 + bp);
    return { netCents: net, vatCents: amountCents - net, grossCents: amountCents };
  }
  const vat = roundDiv(amountCents * bp, 10000);
  return { netCents: amountCents, vatCents: vat, grossCents: amountCents + vat };
}

/** Hourly rate for a duration: the matching tier, or the highest tier plus the per-hour increment. */
export function hourlyRate(pkg: PricingPackage, hours: number): number | null {
  const tiers = pkg.tiers.filter((t) => t.active).sort((a, b) => a.hours - b.hours);
  if (!tiers.length) return null;
  const exact = tiers.find((t) => t.hours === hours);
  if (exact) return exact.rateCents;
  const top = tiers[tiers.length - 1];
  if (hours > top.hours) return top.rateCents + (hours - top.hours) * pkg.extraHourIncrementCents;
  // A gap below the highest tier: use the nearest shorter tier.
  const lower = [...tiers].reverse().find((t) => t.hours < hours);
  return lower ? lower.rateCents : null;
}

export function packageFits(pkg: PricingPackage, hours: number, participants: number) {
  return (
    hours >= pkg.minHours &&
    hours <= pkg.maxHours &&
    participants >= pkg.minParticipants &&
    (pkg.maxParticipants === null || participants <= pkg.maxParticipants)
  );
}

export function quotePackage(pkg: PricingPackage, hours: number, participants: number, settings: PricingSettings): QuoteResult {
  if (!Number.isInteger(hours) || hours < pkg.minHours || hours > pkg.maxHours) return { ok: false, error: "hours_out_of_range" };
  if (!Number.isInteger(participants) || participants < pkg.minParticipants || (pkg.maxParticipants !== null && participants > pkg.maxParticipants)) {
    return { ok: false, error: "participants_out_of_range" };
  }

  const lines: QuoteLine[] = [];
  let maxExtra: number | null = null;
  if (pkg.mode === "hourly_tiers") {
    const rate = hourlyRate(pkg, hours);
    if (rate === null) return { ok: false, error: "no_rate" };
    lines.push({ kind: "hourly", hours, rateCents: rate, amountCents: rate * hours });
  } else if (pkg.mode === "fixed") {
    if (pkg.priceCents === null) return { ok: false, error: "no_price" };
    let units = 1;
    let unitHours: number | null = null;
    if (pkg.durationUnit === "hour") {
      units = hours;
      unitHours = 1;
    } else if (pkg.durationUnit !== "unspecified" && pkg.durationHours) {
      unitHours = pkg.durationHours;
      units = Math.ceil(hours / pkg.durationHours);
    }
    lines.push({ kind: "fixed", units, unit: pkg.durationUnit, unitHours, priceCents: pkg.priceCents, amountCents: pkg.priceCents * units });
  } else {
    if (pkg.priceCents === null) return { ok: false, error: "no_price" };
    const maxAmount = pkg.priceMaxCents !== null && pkg.priceMaxCents > pkg.priceCents ? pkg.priceMaxCents * participants : null;
    lines.push({ kind: "per_person", participants, priceCents: pkg.priceCents, amountCents: pkg.priceCents * participants, maxAmountCents: maxAmount });
    if (maxAmount !== null) maxExtra = maxAmount - pkg.priceCents * participants;
  }

  if (pkg.mode !== "per_person" && pkg.extraPersonPriceCents !== null && pkg.includedParticipants !== null && participants > pkg.includedParticipants) {
    const persons = participants - pkg.includedParticipants;
    lines.push({ kind: "extra_persons", persons, priceCents: pkg.extraPersonPriceCents, amountCents: persons * pkg.extraPersonPriceCents });
  }

  const amount = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const split = splitVat(amount, settings);
  const maxGross = maxExtra !== null ? splitVat(amount + maxExtra, settings).grossCents : null;
  return {
    ok: true,
    quote: {
      packageId: pkg.id,
      packageSlug: pkg.slug,
      packageName: { de: pkg.nameDe, en: pkg.nameEn },
      mode: pkg.mode,
      kind: pkg.priceIsFinal && maxGross === null ? "package" : "estimate",
      hours,
      participants,
      lines,
      ...split,
      maxGrossCents: maxGross,
      vatBasisPoints: settings.vatBasisPoints,
      pricesIncludeVat: settings.pricesIncludeVat,
      periodUnconfirmed: pkg.mode !== "hourly_tiers" && pkg.durationUnit === "unspecified",
    },
  };
}

/** Active packages that fit the duration and group size, in admin order. */
export function applicablePackages(config: PricingConfig, hours: number, participants: number) {
  return config.packages
    .filter((p) => p.active && packageFits(p, hours, participants))
    .filter((p) => quotePackage(p, hours, participants, config.settings).ok)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameDe.localeCompare(b.nameDe));
}

/**
 * Quote for a request: the chosen package when it applies, otherwise the first
 * applicable one. Returns null when no active package covers the request
 * (the request can still be sent; the team then quotes manually).
 */
export function quoteRequest(config: PricingConfig, hours: number, participants: number, packageId?: string | null): Quote | null {
  const options = applicablePackages(config, hours, participants);
  const pkg = options.find((p) => p.id === packageId) ?? options[0];
  if (!pkg) return null;
  const res = quotePackage(pkg, hours, participants, config.settings);
  return res.ok ? res.quote : null;
}

/** Range of durations any active package accepts (for the calculator's hour picker). */
export function hourBounds(config: PricingConfig, fallbackMax = 12) {
  const active = config.packages.filter((p) => p.active);
  if (!active.length) return { min: 1, max: fallbackMax };
  return { min: Math.min(...active.map((p) => p.minHours)), max: Math.max(...active.map((p) => p.maxHours)) };
}

export function formatCents(cents: number, locale: "de" | "en") {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatVatRate(bp: number, locale: "de" | "en") {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 2 }).format(bp / 100) + " %";
}
