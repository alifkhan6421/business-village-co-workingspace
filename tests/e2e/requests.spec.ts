import { expect, test, type Page } from "@playwright/test";
import { ADMIN, berlin, db, deleteBookings, expectSaved, freeDay, login, sentEmails, waitForEmail } from "./helpers";

const REQ_PATTERN = /^BA-\d{4}-\d{5}$/;
const createdRequests: string[] = [];
const createdBookings: string[] = [];

test.afterAll(async () => {
  if (createdRequests.length) {
    const { data } = await db.from("booking_requests").select("booking_id, bookings:bookings!booking_requests_booking_id_fkey(booking_reference)").in("reference", createdRequests);
    for (const r of data ?? []) {
      const ref = (r.bookings as unknown as { booking_reference: string } | null)?.booking_reference;
      if (ref) createdBookings.push(ref);
    }
    await db.from("booking_requests").delete().in("reference", createdRequests);
  }
  await deleteBookings(createdBookings);
});

async function hourlyPackage() {
  const { data } = await db.from("pricing_packages").select("id").eq("slug", "meeting-room-hourly").single();
  return data!.id as string;
}

async function setTier(hours: number, rate: number) {
  await db.from("pricing_hourly_tiers").update({ hourly_rate: rate }).eq("package_id", await hourlyPackage()).eq("hours", hours);
}

async function calculate(page: Page, path: string, hours: number, people: number) {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.click(`[data-testid=price-calculator] [data-testid=hours-${hours}]`);
  await page.fill("#calc-people", String(people));
  return page.locator("[data-testid=price-calculator] [data-testid=estimate-total]");
}

test("calculator: price per person in both languages, room options from 10 people, and an admin price change applies at once", async ({ page }) => {
  try {
    // 5 people, 4 hours: 5 × 25 € = 125 €.
    await expect(await calculate(page, "/de/preise", 4, 5)).toContainText("125");
    await expect(page.locator("[data-testid=price-calculator] [data-testid=estimate-net]")).toContainText("105,04");
    await expect(page.locator("[data-testid=price-calculator] [data-testid=estimate-vat]")).toContainText("19,96");
    await expect(await calculate(page, "/en/pricing", 4, 5)).toContainText("125");
    await expect(page.locator("[data-testid=price-calculator] [data-testid=estimate-net]")).toContainText("105.04");
    await expect(await calculate(page, "/en/pricing", 8, 9)).toContainText("279");

    // From 10 people a whole room can be chosen instead.
    const calc = page.locator("[data-testid=price-calculator]");
    await expect(await calculate(page, "/de/preise", 8, 10)).toContainText("310");
    await calc.getByRole("radio", { name: /Blauer Raum/ }).check();
    await expect(calc.locator("[data-testid=estimate-total]")).toContainText("295");
    await page.fill("#calc-people", "12");
    await expect(calc.locator("[data-testid=estimate-total]")).toContainText("295");
    await page.fill("#calc-people", "13");
    await expect(calc.locator("[data-testid=estimate-total]")).toContainText("395");

    // The entire venue and the event stairs are separate choices; their prices don't depend on the hours.
    await calc.locator("[data-testid=category-venue]").click();
    await expect(calc.locator("[data-testid=hours-4]")).toHaveCount(0);
    await page.fill("#calc-people", "45");
    await expect(calc.locator("[data-testid=estimate-total]")).toContainText("2.450");
    await calc.locator("[data-testid=category-stairs]").click();
    await page.fill("#calc-people", "30");
    await expect(calc.locator("[data-testid=estimate-total]")).toContainText("300");
    await expect(calc.locator("[data-testid=estimate-total]")).toContainText("450");

    // Admin changes the 8-hour price to €35 in Preisverwaltung: 9 × 35 € = 315 €.
    await login(page, ADMIN);
    await page.goto("/de/admin/pricing", { waitUntil: "networkidle" });
    const tier = page.locator("[data-testid=package-meeting-room-hourly] [data-testid=tier-8]");
    await tier.locator("input[name=hourly_rate]").fill("35");
    await tier.locator("button[type=submit]").click();
    await expectSaved(page);
    await expect(await calculate(page, "/de/preise", 8, 9)).toContainText("315");
  } finally {
    await setTier(8, 31);
  }
});

test("guest sends a request from a room page; nothing is reserved; admin assigns, confirms and a second confirmation is refused", async ({ page, browser }) => {
  const { day, resourceId } = await freeDay("room", "berlin-room", "10:00", "12:00", 14);
  const email = `e2e-request-${Date.now()}@example.com`;

  // Room page: no availability calendar for visitors, only the request button.
  await page.goto("/de/besprechungsraeume/berlin-room", { waitUntil: "networkidle" });
  await expect(page.locator(".fc")).toHaveCount(0);
  await page.locator("[data-testid=request-booking]").first().click();
  await page.waitForURL(/\/de\/buchungsanfrage\?/);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#rq-people")).toHaveValue("10");

  await page.fill("#rq-date", day);
  await page.selectOption("#rq-hours", "2");
  await page.selectOption("#rq-start", "10:00");
  await page.fill("#rq-people", "9");
  await page.fill("#rq-name", "Erika Muster");
  await page.fill("#rq-email", email);
  await page.fill("#rq-company", "Muster GmbH");
  await expect(page.locator("[data-testid=request-summary] [data-testid=estimate-total]")).toContainText("153");
  await page.click("[data-testid=submit-request]");

  await expect(page.locator("[data-testid=request-success]")).toContainText("Ihre Buchungsanfrage ist eingegangen. Unser Team prüft Ihre Anfrage und meldet sich mit einer Bestätigung bei Ihnen.");
  const reference = (await page.textContent("[data-testid=request-reference]"))!.trim();
  createdRequests.push(reference);
  expect(reference).toMatch(REQ_PATTERN);

  // Stored as pending with the estimate snapshot; no booking was created.
  const { data: req } = await db.from("booking_requests").select("*").eq("reference", reference).single();
  expect(req!.status).toBe("pending");
  expect(Number(req!.estimate_gross)).toBe(153);
  expect(req!.booking_id).toBeNull();
  const { count: reserved } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("room_id", resourceId).eq("start_at", berlin(day, "10:00"));
  expect(reserved).toBe(0);
  const mail = await waitForEmail(email, /Ihre Buchungsanfrage/);
  expect(mail.html).toContain(reference);
  expect(mail.html).toContain("153");

  // The snapshot survives a later price change.
  await setTier(2, 20);
  try {
    const { data: again } = await db.from("booking_requests").select("estimate_gross, estimate_snapshot").eq("id", req!.id).single();
    expect(Number(again!.estimate_gross)).toBe(153);
    expect((again!.estimate_snapshot as { grossCents: number }).grossCents).toBe(15300);
  } finally {
    await setTier(2, 17);
  }

  // A second request for the same slot, submitted on the English form.
  const other = await browser.newPage();
  const email2 = `e2e-request2-${Date.now()}@example.com`;
  await other.goto(`/en/booking-request?date=${day}&hours=2&start=10:00&people=4`, { waitUntil: "networkidle" });
  await other.fill("#rq-name", "John Smith");
  await other.fill("#rq-email", email2);
  await other.click("[data-testid=submit-request]");
  await expect(other.locator("[data-testid=request-success]")).toContainText("Your booking request has been received. Our team will review it and contact you with confirmation.");
  const reference2 = (await other.textContent("[data-testid=request-reference]"))!.trim();
  createdRequests.push(reference2);
  await waitForEmail(email2, /Your booking request/);
  await other.close();

  // Admin: list, assign the room, confirm.
  await login(page, ADMIN);
  await page.goto(`/de/admin/requests?q=${reference}`, { waitUntil: "networkidle" });
  await page.locator("[data-testid=request-table]").getByRole("link", { name: reference, exact: true }).click();
  await page.waitForURL(/\/de\/admin\/requests\/[0-9a-f-]{36}/);
  const details = page.locator("[data-testid=request-details-form]");
  await details.locator("#rq-space").selectOption(`room:${resourceId}`);
  await details.locator("button[type=submit]").click();
  await expectSaved(page);
  await page.click("[data-testid=action-confirmed]");
  await page.locator("[data-testid=status-form] button[type=submit]").click();
  await expectSaved(page);
  await expect.poll(async () => (await db.from("booking_requests").select("status").eq("id", req!.id).single()).data?.status).toBe("confirmed");
  const { data: confirmed } = await db.from("booking_requests").select("booking_id, price_gross, estimate_gross").eq("id", req!.id).single();
  expect(confirmed!.booking_id).toBeTruthy();
  const { data: booking } = await db.from("bookings").select("status, room_id, booking_request_id").eq("id", confirmed!.booking_id!).single();
  expect(booking).toMatchObject({ status: "confirmed", room_id: resourceId, booking_request_id: req!.id });
  await waitForEmail(email, /Ihre Buchung ist bestätigt/);
  await expect(page.locator("[data-testid=request-history]")).toContainText("Status geändert");

  // The second request cannot be confirmed into the same room and time.
  const { data: req2 } = await db.from("booking_requests").select("id").eq("reference", reference2).single();
  await page.goto(`/en/admin/requests/${req2!.id}`, { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=overlapping-bookings]")).toContainText("Berlin");
  await expect(page.locator("#rq-space option", { hasText: "occupied" }).first()).toBeAttached();
  await page.locator("[data-testid=request-details-form] #rq-space").selectOption(`room:${resourceId}`);
  await page.locator("[data-testid=request-details-form] button[type=submit]").click();
  await expectSaved(page);
  await page.click("[data-testid=action-confirmed]");
  await page.locator("[data-testid=status-form] button[type=submit]").click();
  await expect(page.locator("[data-testid=status-form]")).toContainText(/just taken|already been booked|no longer available/i);
  expect((await db.from("booking_requests").select("status").eq("id", req2!.id).single()).data?.status).toBe("pending");

  // Reject it with a reason; the customer is told in English.
  await page.keyboard.press("Escape");
  await page.click("[data-testid=action-rejected]");
  await page.fill("[data-testid=status-form] #st-note", "The room is fully booked at that time.");
  await page.locator("[data-testid=status-form] button[type=submit]").click();
  await expectSaved(page);
  await expect.poll(async () => (await sentEmails(email2)).some((m) => m.html.includes("fully booked at that time"))).toBe(true);
});

test("requests are for rooms only: no desk choice, no coworking in the menu, old links lead on", async ({ page }) => {
  await page.goto("/en/booking-request?space=desk", { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=category-picker]")).toBeVisible();
  await expect(page.getByText("Desk", { exact: true })).toHaveCount(0);
  await expect(page.locator(".fc")).toHaveCount(0);

  await page.goto("/de", { waitUntil: "networkidle" });
  await expect(page.locator("header a[href='/de/coworking']")).toHaveCount(0);
  await page.goto("/de/coworking");
  await expect(page).toHaveURL(/\/de\/besprechungsraeume/);
  await page.goto("/en/search?type=workspace", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/en\/booking-request/);

  // Room lists have no date and time availability filter.
  await page.goto("/de/besprechungsraeume", { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=resource-filters] input[type=date]")).toHaveCount(0);
  // Cards only lead to the details page; the request button lives there.
  await expect(page.locator("[data-testid=resource-card] [data-testid=view-details]").first()).toBeVisible();
  await expect(page.locator("[data-testid=resource-card] [data-testid=request-booking]")).toHaveCount(0);
});
