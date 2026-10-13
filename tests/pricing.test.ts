/**
 * Unit tests for the pricing calculation (no database needed).
 *
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applicablePackages,
  quotePackage,
  quoteRequest,
  splitVat,
  toCents,
  centsToDecimal,
  type PricingConfig,
  type PricingPackage,
} from "../src/lib/pricing/calc";

const RATES: [number, number][] = [[1, 12], [2, 17], [3, 21], [4, 25], [5, 27], [6, 29], [7, 30], [8, 31]];

function pkg(over: Partial<PricingPackage>): PricingPackage {
  return {
    id: over.slug ?? "p",
    slug: "p",
    nameDe: "P",
    nameEn: "P",
    descriptionDe: "",
    descriptionEn: "",
    mode: "fixed",
    priceCents: null,
    priceMaxCents: null,
    durationUnit: "unspecified",
    durationHours: null,
    minHours: 1,
    maxHours: 14,
    extraHourIncrementCents: 0,
    minParticipants: 1,
    maxParticipants: null,
    includedParticipants: null,
    extraPersonPriceCents: null,
    roomId: null,
    priceIsFinal: false,
    active: true,
    sortOrder: 0,
    tiers: [],
    ...over,
  };
}

const hourly = pkg({
  slug: "meeting-room-hourly",
  mode: "hourly_tiers",
  durationUnit: "hour",
  maxHours: 10,
  maxParticipants: 10,
  extraHourIncrementCents: 100,
  sortOrder: 10,
  tiers: RATES.map(([hours, eur]) => ({ hours, rateCents: eur * 100, active: true })),
});
const gruen = pkg({ slug: "gruener-raum", priceCents: 49500, maxParticipants: 40, sortOrder: 50 });
const komplett = pkg({ slug: "komplett", priceCents: 240000, includedParticipants: 40, extraPersonPriceCents: 1000, sortOrder: 60 });
const treppe = pkg({ slug: "treppe", mode: "per_person", priceCents: 1000, priceMaxCents: 1500, sortOrder: 70 });
const settings = { vatBasisPoints: 1900, pricesIncludeVat: true, displayMode: "gross" as const };
const config: PricingConfig = { settings, packages: [hourly, gruen, komplett, treppe] };

test("9 people, 8 hours: 8 x €31 = €248 including VAT", () => {
  const q = quoteRequest(config, 8, 9);
  assert.ok(q);
  assert.equal(q.packageSlug, "meeting-room-hourly");
  assert.equal(q.grossCents, 24800);
  assert.equal(q.netCents + q.vatCents, 24800);
  assert.equal(q.netCents, 20840); // 248 / 1.19 = 208.40
  assert.equal(q.vatCents, 3960);
});

test("participants do not multiply the hourly rate", () => {
  assert.equal(quoteRequest(config, 8, 1)!.grossCents, quoteRequest(config, 8, 10)!.grossCents);
});

test("changing the 8-hour rate to €35 gives €280", () => {
  const changed = { ...hourly, tiers: hourly.tiers.map((t) => (t.hours === 8 ? { ...t, rateCents: 3500 } : t)) };
  const q = quoteRequest({ settings, packages: [changed] }, 8, 9);
  assert.equal(q!.grossCents, 28000);
});

test("every tier from the table", () => {
  for (const [h, eur] of RATES) assert.equal(quoteRequest(config, h, 4)!.grossCents, h * eur * 100, `${h} hours`);
});

test("beyond 8 hours the hourly rate rises by €1 per hour", () => {
  assert.equal(quoteRequest(config, 9, 4)!.grossCents, 9 * 3200);
  assert.equal(quoteRequest(config, 10, 4)!.grossCents, 10 * 3300);
  assert.equal(quotePackage(hourly, 11, 4, settings).ok, false); // above the package maximum
});

test("more than 10 people never use the small-room hourly pricing", () => {
  const options = applicablePackages(config, 4, 11).map((p) => p.slug);
  assert.ok(!options.includes("meeting-room-hourly"));
  assert.equal(quoteRequest(config, 4, 11)!.packageSlug, "gruener-raum");
  assert.equal(quoteRequest({ settings, packages: [hourly] }, 4, 11), null);
});

test("inactive packages are ignored", () => {
  assert.equal(quoteRequest({ settings, packages: [{ ...hourly, active: false }] }, 8, 9), null);
});

test("extra participants above 40 cost €10 each", () => {
  const q = quotePackage(komplett, 8, 45, settings);
  assert.ok(q.ok);
  assert.equal(q.quote.grossCents, 240000 + 5 * 1000);
});

test("per-person packages give a range", () => {
  const q = quotePackage(treppe, 3, 20, settings);
  assert.ok(q.ok);
  assert.equal(q.quote.grossCents, 20000);
  assert.equal(q.quote.maxGrossCents, 30000);
  assert.equal(q.quote.kind, "estimate");
});

test("fixed packages by rental period", () => {
  const halfDay = pkg({ priceCents: 29500, durationUnit: "half_day", durationHours: 4 });
  assert.equal((quotePackage(halfDay, 3, 5, settings) as { ok: true; quote: { grossCents: number } }).quote.grossCents, 29500);
  assert.equal((quotePackage(halfDay, 5, 5, settings) as { ok: true; quote: { grossCents: number } }).quote.grossCents, 59000);
  const unspecified = quotePackage(gruen, 6, 30, settings);
  assert.ok(unspecified.ok && unspecified.quote.periodUnconfirmed && unspecified.quote.grossCents === 49500);
  const final = quotePackage({ ...gruen, priceIsFinal: true }, 6, 30, settings);
  assert.ok(final.ok && final.quote.kind === "package");
});

test("VAT when stored prices are net", () => {
  assert.deepEqual(splitVat(24800, { ...settings, pricesIncludeVat: false }), { netCents: 24800, vatCents: 4712, grossCents: 29512 });
  assert.deepEqual(splitVat(100, settings), { netCents: 84, vatCents: 16, grossCents: 100 });
  assert.deepEqual(splitVat(1000, { ...settings, vatBasisPoints: 700 }), { netCents: 935, vatCents: 65, grossCents: 1000 });
});

test("decimal conversion without floating point", () => {
  assert.equal(toCents("31.00"), 3100);
  assert.equal(toCents("0.10"), 10);
  assert.equal(toCents("2400"), 240000);
  assert.equal(toCents("19.5"), 1950);
  assert.equal(toCents(31), 3100);
  assert.equal(toCents("abc"), null);
  assert.equal(centsToDecimal(24800), "248.00");
  assert.equal(centsToDecimal(5), "0.05");
});
