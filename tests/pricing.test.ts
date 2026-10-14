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
    category: "meeting",
    priceCents: null,
    priceMaxCents: null,
    durationUnit: "unspecified",
    durationHours: null,
    minHours: 1,
    maxHours: 14,
    extraHourIncrementCents: 0,
    tierPricePerPerson: false,
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
  tierPricePerPerson: true,
  sortOrder: 10,
  tiers: RATES.map(([hours, eur]) => ({ hours, rateCents: eur * 100, active: true })),
});
const gruen = pkg({ slug: "gruener-raum", priceCents: 49500, maxParticipants: 40, sortOrder: 50 });
const komplett = pkg({ slug: "komplett", priceCents: 240000, includedParticipants: 40, extraPersonPriceCents: 1000, sortOrder: 60 });
const treppe = pkg({ slug: "treppe", mode: "per_person", priceCents: 1000, priceMaxCents: 1500, sortOrder: 70 });
const settings = { vatBasisPoints: 1900, pricesIncludeVat: true, displayMode: "gross" as const };
const config: PricingConfig = { settings, packages: [hourly, gruen, komplett, treppe] };

test("price per person: 5 people, 4 hours = 5 x €25 = €125 including VAT", () => {
  const q = quoteRequest(config, 4, 5);
  assert.ok(q);
  assert.equal(q.packageSlug, "meeting-room-hourly");
  assert.equal(q.grossCents, 12500);
  assert.equal(q.netCents, 10504); // 125 / 1.19 = 105.04
  assert.equal(q.vatCents, 1996);
  assert.deepEqual(q.lines, [{ kind: "tier_per_person", hours: 4, participants: 5, priceCents: 2500, amountCents: 12500 }]);
});

test("9 people, 8 hours: 9 x €31 = €279", () => {
  assert.equal(quoteRequest(config, 8, 9)!.grossCents, 27900);
});

test("one person pays the tier price from the price sheet, with its net value", () => {
  const sheet: [number, number][] = [[1, 1008], [2, 1429], [3, 1765], [4, 2101], [5, 2269], [6, 2437], [7, 2521], [8, 2605]];
  for (const [h, net] of sheet) {
    const q = quoteRequest(config, h, 1)!;
    assert.equal(q.grossCents, RATES[h - 1][1] * 100, `${h} hours`);
    assert.equal(q.netCents, net, `${h} hours net`);
  }
});

test("changing the 8-hour price to €35 gives 9 x €35 = €315", () => {
  const changed = { ...hourly, tiers: hourly.tiers.map((t) => (t.hours === 8 ? { ...t, rateCents: 3500 } : t)) };
  assert.equal(quoteRequest({ settings, packages: [changed] }, 8, 9)!.grossCents, 31500);
});

test("beyond 8 hours the price per person rises by €1 per hour", () => {
  assert.equal(quoteRequest(config, 9, 4)!.grossCents, 4 * 3200);
  assert.equal(quoteRequest(config, 10, 4)!.grossCents, 4 * 3300);
  assert.equal(quotePackage(hourly, 11, 4, settings).ok, false); // above the package maximum
});

test("with the per-person setting off, tiers are hourly rates: 8 x €31 = €248", () => {
  const perHour = { ...hourly, tierPricePerPerson: false };
  const cfg = { settings, packages: [perHour] };
  assert.equal(quoteRequest(cfg, 8, 9)!.grossCents, 24800);
  assert.equal(quoteRequest(cfg, 8, 1)!.grossCents, quoteRequest(cfg, 8, 10)!.grossCents);
  for (const [h, eur] of RATES) assert.equal(quoteRequest(cfg, h, 4)!.grossCents, h * eur * 100, `${h} hours`);
});

test("from 10 people a whole room at a flat price is offered next to the per-person price", () => {
  const blau = pkg({ slug: "blauer-raum", priceCents: 29500, minParticipants: 10, maxParticipants: 10, sortOrder: 30 });
  const cfg = { settings, packages: [hourly, blau, { ...gruen, minParticipants: 10 }] };
  assert.deepEqual(applicablePackages(cfg, 8, 9).map((p) => p.slug), ["meeting-room-hourly"]);
  assert.deepEqual(applicablePackages(cfg, 8, 10).map((p) => p.slug), ["meeting-room-hourly", "blauer-raum", "gruener-raum"]);
  assert.equal(quoteRequest(cfg, 8, 10)!.grossCents, 31000);
  assert.equal(quoteRequest(cfg, 8, 10, blau.id)!.grossCents, 29500);
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
