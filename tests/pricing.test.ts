/**
 * Unit tests for the pricing engine (no database): npm run test:pricing
 */
import assert from "node:assert/strict";
import { applicableEstimates, centsToDecimal, computeEstimate, splitVat, toCents, type HourlyPlan, type PricePackage, type PricingConfig } from "../src/lib/pricing/calc";

const tiers = [12, 17, 21, 25, 27, 29, 30, 31].map((rate, i) => ({ id: `t${i + 1}`, hours: i + 1, hourlyRate: rate, active: true }));
const smallRoom: HourlyPlan = {
  id: "small", nameDe: "Besprechungsraum bis 10 Personen", nameEn: "Meeting room up to 10 people", descriptionDe: "", descriptionEn: "", roomId: null,
  minParticipants: 1, maxParticipants: 10, minHours: 1, maxHours: 12, extraHourIncrement: 1, priceType: "fixed", active: true, displayOrder: 0, tiers,
};
const pkg = (id: string, price: number, max: number | null, order: number, extra: number | null = null, mode: "flat" | "per_person" = "flat"): PricePackage => ({
  id, nameDe: id, nameEn: id, descriptionDe: "", descriptionEn: "", roomId: null, pricingMode: mode, price, durationType: "custom", durationHours: null,
  durationLabelDe: "", durationLabelEn: "", minParticipants: 1, maxParticipants: max, extraPersonPrice: extra, maxExtraParticipants: null,
  priceType: "estimate", active: true, displayOrder: order,
});
const config: PricingConfig = {
  settings: { vatRate: 19, pricesIncludeVat: true, displayMode: "gross", showVatBreakdown: true, noteDe: "", noteEn: "" },
  plans: [smallRoom],
  packages: [pkg("blauer", 295, 10, 10), pkg("roter-maxi", 395, 20, 20), pkg("gruener", 495, 40, 30, 10), pkg("komplett", 2400, null, 40), pkg("treppe", 10, null, 50, null, "per_person")],
};

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("pricing engine");

test("toCents parses decimals exactly", () => {
  assert.equal(toCents("31.00"), 3100);
  assert.equal(toCents(31), 3100);
  assert.equal(toCents("0.1"), 10);
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents("12.345"), 1235);
  assert.equal(centsToDecimal(24800), "248.00");
  assert.equal(centsToDecimal(5), "0.05");
});

test("9 participants, 8 hours = 8 × €31 = €248 incl. VAT", () => {
  const e = computeEstimate(config, { hours: 8, participants: 9 })!;
  assert.equal(e.option.id, "small");
  assert.equal(e.hourlyRateCents, 3100);
  assert.equal(e.grossCents, 24800);
  assert.equal(e.netCents + e.vatCents, 24800);
  assert.equal(e.netCents, 20840); // 248 / 1.19 = 208.403…
  assert.equal(e.vatCents, 3960);
});

test("participants do not multiply the hourly price", () => {
  assert.equal(computeEstimate(config, { hours: 3, participants: 1 })!.grossCents, computeEstimate(config, { hours: 3, participants: 10 })!.grossCents);
  assert.equal(computeEstimate(config, { hours: 3, participants: 10 })!.grossCents, 6300);
});

test("every tier from the price list", () => {
  [12, 17, 21, 25, 27, 29, 30, 31].forEach((rate, i) => {
    assert.equal(computeEstimate(config, { hours: i + 1, participants: 4 })!.grossCents, rate * (i + 1) * 100);
  });
});

test("beyond the last tier the rate rises by the increment per hour (9 h → €32/h)", () => {
  const e = computeEstimate(config, { hours: 9, participants: 4 })!;
  assert.equal(e.hourlyRateCents, 3200);
  assert.equal(e.grossCents, 28800);
});

test("changing the 8-hour rate to €35 gives €280", () => {
  const changed: PricingConfig = { ...config, plans: [{ ...smallRoom, tiers: tiers.map((t) => (t.hours === 8 ? { ...t, hourlyRate: 35 } : t)) }] };
  assert.equal(computeEstimate(changed, { hours: 8, participants: 9 })!.grossCents, 28000);
});

test("more than 10 people use the next fitting room package, not the small-room price", () => {
  const e = computeEstimate(config, { hours: 4, participants: 15 })!;
  assert.equal(e.option.id, "roter-maxi");
  assert.equal(e.grossCents, 39500);
  assert.ok(!applicableEstimates(config, { hours: 4, participants: 15 }).some((x) => x.option.id === "small" || x.option.id === "blauer"));
});

test("extra participants above 40 cost €10 each where the package allows it", () => {
  const e = computeEstimate(config, { hours: 4, participants: 45 }, "package:gruener")!;
  assert.equal(e.grossCents, 49500 + 5 * 1000);
  assert.equal(e.lines[1].code, "extra_person");
});

test("per-person packages multiply by participants", () => {
  assert.equal(computeEstimate(config, { hours: 3, participants: 30 }, "package:treppe")!.grossCents, 30000);
});

test("an unknown or non-applicable category falls back to the default", () => {
  assert.equal(computeEstimate(config, { hours: 2, participants: 15 }, "plan:small")!.option.id, "roter-maxi");
});

test("prices excluding VAT add 19% on top", () => {
  const net = splitVat(24800, { vatRate: 19, pricesIncludeVat: false });
  assert.deepEqual(net, { netCents: 24800, vatCents: 4712, grossCents: 29512 });
  const odd = splitVat(1999, { vatRate: 7.5, pricesIncludeVat: true });
  assert.equal(odd.netCents + odd.vatCents, 1999);
});

test("inactive tiers, plans and invalid input are ignored", () => {
  const inactive: PricingConfig = { ...config, plans: [{ ...smallRoom, active: false }] };
  assert.equal(computeEstimate(inactive, { hours: 8, participants: 9 })!.option.id, "blauer");
  assert.equal(computeEstimate(config, { hours: 0, participants: 9 }), null);
  assert.equal(computeEstimate(config, { hours: 2.5, participants: 9 }), null);
  const noTier8: PricingConfig = { ...config, plans: [{ ...smallRoom, tiers: tiers.map((t) => (t.hours === 8 ? { ...t, active: false } : t)) }] };
  assert.equal(computeEstimate(noTier8, { hours: 8, participants: 9 })!.hourlyRateCents, 3000 + 100);
});

test("duration limits of plans and packages", () => {
  assert.ok(!applicableEstimates(config, { hours: 13, participants: 5 }).some((e) => e.option.id === "small"));
  const halfDay: PricingConfig = { ...config, plans: [], packages: [{ ...pkg("half", 200, 10, 0), durationType: "half_day", durationHours: 4 }] };
  assert.equal(computeEstimate(halfDay, { hours: 4, participants: 5 })!.grossCents, 20000);
  assert.equal(computeEstimate(halfDay, { hours: 5, participants: 5 }), null);
});

console.log(`\n${passed} passed`);
