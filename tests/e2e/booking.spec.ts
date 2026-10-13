import { expect, test } from "@playwright/test";
import { MEMBER, REF_PATTERN, db, deleteBookings, freeDay, login, pickSlot, waitForEmail, weekdayAhead } from "./helpers";

const created: string[] = [];
test.afterAll(async () => deleteBookings(created));

/** Removes booking requests (and their linked bookings) created by a test. */
async function deleteRequests(references: string[]) {
  if (!references.length) return;
  await db.from("booking_requests").delete().in("reference", references);
  await deleteBookings(references);
}

const requests: string[] = [];
test.afterAll(async () => deleteRequests(requests));

for (const c of [
  {
    locale: "de", path: "/de/besprechungsraeume/berlin-room", room: "Berlin Room", gross: "248,00 €",
    success: "Ihre Buchungsanfrage ist eingegangen. Unser Team prüft Ihre Anfrage und meldet sich mit einer Bestätigung bei Ihnen.",
    subject: /Ihre Buchungsanfrage BV-\d{4}-\d{6} ist eingegangen/, form: /\/de\/buchungsanfrage/,
  },
  {
    locale: "en", path: "/en/meeting-rooms/focus-room", room: "Focus Room", gross: "€248.00",
    success: "Your booking request has been received. Our team will review it and contact you with confirmation.",
    subject: /We have received your booking request BV-\d{4}-\d{6}/, form: /\/en\/booking-request/,
  },
] as const) {
  test(`guest sends a booking request from a room page, nothing is reserved (${c.locale})`, async ({ page }) => {
    const day = weekdayAhead(12);
    const email = `e2e-request-${c.locale}-${Date.now()}@example.com`;

    // Room pages keep their details but show no availability and no direct booking.
    await page.goto(c.path, { waitUntil: "networkidle" });
    await expect(page.locator("[data-testid=room-request-cta]")).toBeVisible();
    await expect(page.locator(".fc")).toHaveCount(0);
    await expect(page.locator("#bk-date")).toHaveCount(0);
    await page.locator("[data-testid=room-request-cta] a").first().click();
    await page.waitForURL(c.form);
    await expect(page.locator("body")).toContainText(c.room);

    await page.fill("#rq-date", day);
    await page.selectOption("#rq-start", "09:00");
    await page.selectOption("#rq-hours", "8");
    await page.fill("#rq-participants", "9");
    await expect(page.locator("[data-testid=estimate-gross]")).toHaveText(c.gross);
    await page.fill("#rq-name", "Erika Muster");
    await page.fill("#rq-email", email);
    await page.fill("#rq-company", "Muster GmbH");
    await page.click("[data-testid=submit-request]");

    await expect(page.locator("[data-testid=request-success-text]")).toHaveText(c.success);
    const reference = (await page.textContent("[data-testid=request-reference]"))!.trim();
    requests.push(reference);
    expect(reference).toMatch(REF_PATTERN);

    // Stored as a pending request with a server-calculated price snapshot; no booking exists.
    const { data: row } = await db.from("booking_requests").select("status, estimated_gross, estimated_net, estimated_vat, price_snapshot, duration_hours, participants, locale, assigned_room_id").eq("reference", reference).single();
    expect(row!.status).toBe("pending");
    expect(Number(row!.estimated_gross)).toBe(248);
    expect(Number(row!.estimated_net) + Number(row!.estimated_vat)).toBeCloseTo(248, 2);
    expect((row!.price_snapshot as { hourlyRateCents: number }).hourlyRateCents).toBe(3100);
    expect(row!.assigned_room_id).toBeNull();
    expect(row!.locale).toBe(c.locale);
    const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("booking_reference", reference);
    expect(count).toBe(0);

    // Receipt to the customer in their language, notification with a dashboard link to the team.
    const mail = await waitForEmail(email, c.subject);
    expect(mail.html).toContain(reference);
    const team = await waitForEmail("booking@business-village.de", new RegExp(`Neue Buchungsanfrage ${reference}`));
    expect(team.html).toMatch(/\/de\/admin\/requests\/[0-9a-f-]{36}/);
  });
}

test("the public form refuses dates in the past", async ({ page }) => {
  await page.goto("/en/booking-request?hours=3&participants=4", { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=estimate-gross]")).toHaveText("€63.00");
  await page.evaluate(() => {
    const d = document.querySelector<HTMLInputElement>("#rq-date")!;
    d.removeAttribute("min");
  });
  await page.fill("#rq-date", "2020-01-06");
  await page.fill("#rq-name", "Past Person");
  await page.fill("#rq-email", `e2e-past-${Date.now()}@example.com`);
  await page.click("[data-testid=submit-request]");
  await expect(page.getByText("This date is in the past.")).toBeVisible();
  await expect(page.locator("[data-testid=request-success]")).toHaveCount(0);
});

test("pricing page: 9 people for 8 hours cost €248, larger groups get packages", async ({ page }) => {
  await page.goto("/de/preise", { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=hourly-plan]").first()).toContainText("31,00 €");
  await page.fill("#pc-hours", "8");
  await page.fill("#pc-participants", "9");
  await expect(page.locator("[data-testid=estimate-gross]")).toHaveText("248,00 €");
  await page.fill("#pc-participants", "18");
  await expect(page.locator("[data-testid=estimate-gross]")).toHaveText("395,00 €");
  await expect(page.locator("[data-testid=estimate-type]")).toHaveText("Schätzung");
  await page.click("[data-testid=calculator-request]");
  await page.waitForURL(/\/de\/buchungsanfrage\?.*hours=8.*participants=18/);
  await expect(page.locator("[data-testid=estimate-gross]")).toHaveText("395,00 €");

  await page.goto("/en/pricing", { waitUntil: "networkidle" });
  await expect(page.locator("h1")).toBeVisible();
  await page.fill("#pc-hours", "8");
  await page.fill("#pc-participants", "9");
  await expect(page.locator("[data-testid=estimate-gross]")).toHaveText("€248.00");
});

test("member books a desk, sees it in the account and cancels it", async ({ page }) => {
  const { day } = await freeDay("workspace", "b-03", "09:00", "12:00");
  await login(page, MEMBER);
  await page.goto("/de/coworking/b-03", { waitUntil: "networkidle" });
  await pickSlot(page, day, "09:00", "12:00", "continue-to-review");
  await page.click("[data-testid=continue-to-review]");
  await page.click("[data-testid=confirm-booking]");
  await page.waitForURL(/\/de\/konto\/buchungen/, { timeout: 30_000 });
  const reference = new URL(page.url()).searchParams.get("new")!;
  created.push(reference);
  expect(reference).toMatch(REF_PATTERN);

  const row = page.locator("[data-testid=my-booking]", { hasText: reference });
  await expect(row).toBeVisible();
  await row.locator("[data-testid=cancel-booking]").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Buchung stornieren" }).click();
  await expect.poll(async () => (await db.from("bookings").select("status").eq("booking_reference", reference).single()).data?.status).toBe("cancelled");
  await waitForEmail(MEMBER.email, new RegExp(`Buchung storniert – ${reference}`));
});

test("member cannot open the admin area", async ({ page }) => {
  await login(page, MEMBER);
  const res = await page.goto("/de/admin");
  expect(res?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText("Dashboard");
});
