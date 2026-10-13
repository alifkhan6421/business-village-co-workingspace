import { expect, test } from "@playwright/test";
import { ADMIN, REF_PATTERN, berlin, db, deleteBookings, expectSaved, freeDay, login, waitForEmail } from "./helpers";

const requests: string[] = [];
test.afterAll(async () => {
  if (!requests.length) return;
  const { data } = await db.from("booking_requests").select("guest_id").in("reference", requests);
  await db.from("booking_requests").delete().in("reference", requests);
  await deleteBookings(requests);
  const guests = [...new Set((data ?? []).map((r) => r.guest_id).filter(Boolean))] as string[];
  for (const g of guests) {
    const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("guest_id", g);
    if (!count) await db.from("guests").delete().eq("id", g);
  }
});

/** A pending request as the public form would store it (server-side fixture). */
async function makeRequest(day: string, start: string, hours: number, participants: number, locale: "de" | "en", email: string) {
  const { data, error } = await db.rpc("submit_booking_request", {
    p_start: berlin(day, start),
    p_end: new Date(new Date(berlin(day, start)).getTime() + hours * 3_600_000).toISOString(),
    p_duration_hours: hours,
    p_participants: participants,
    p_full_name: "Rita Request",
    p_email: email,
    p_phone: "",
    p_company: "Request AG",
    p_message: "Beamer bitte",
    p_locale: locale,
    p_user_id: null as unknown as string,
    p_preferred_room_id: null as unknown as string,
    p_price_snapshot: null as never,
    p_net: null as unknown as number,
    p_vat: null as unknown as number,
    p_gross: null as unknown as number,
  });
  expect(error).toBeNull();
  requests.push(data![0].reference);
  return data![0] as { request_id: string; reference: string };
}

test("admin changes the 8-hour rate to €35 and the calculator shows €280", async ({ page }) => {
  const { data: plan } = await db.from("price_hourly_plans").select("id").eq("name_de", "Besprechungsraum bis 10 Personen").single();
  const { data: tier } = await db.from("price_hourly_tiers").select("id, hourly_rate").eq("plan_id", plan!.id).eq("hours", 8).single();
  try {
    await login(page, ADMIN);
    await page.goto("/de/admin/pricing", { waitUntil: "networkidle" });
    const row = page.locator("[data-testid=admin-plan]", { hasText: "Besprechungsraum bis 10 Personen" }).locator("[data-testid=tier-8]");
    await row.locator("input[name=hourly_rate]").fill("35,00");
    await expect(row.locator("[data-testid=tier-total]")).toContainText("280,00");
    await row.getByRole("button", { name: /speichern/i }).click();
    await expectSaved(page);
    await expect.poll(async () => Number((await db.from("price_hourly_tiers").select("hourly_rate").eq("id", tier!.id).single()).data?.hourly_rate)).toBe(35);

    for (const [path, gross] of [["/de/preise", "280,00 €"], ["/en/pricing", "€280.00"]] as const) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.fill("#pc-hours", "8");
      await page.fill("#pc-participants", "9");
      await expect(page.locator("[data-testid=estimate-gross]")).toHaveText(gross);
    }
    // The change is in the audit log.
    const { count } = await db.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "PRICING_UPDATED").eq("entity_id", tier!.id);
    expect(count).toBeGreaterThan(0);
  } finally {
    await db.from("price_hourly_tiers").update({ hourly_rate: tier!.hourly_rate }).eq("id", tier!.id);
  }
});

test("admin assigns a room, confirms a request and a second request for the same slot is refused", async ({ page }) => {
  const { day } = await freeDay("room", "hamburg-room", "09:00", "12:00", 20);
  const first = await makeRequest(day, "09:00", 3, 6, "en", `e2e-req-a-${Date.now()}@example.com`);
  const second = await makeRequest(day, "10:00", 2, 4, "de", `e2e-req-b-${Date.now()}@example.com`);
  const { data: firstRow } = await db.from("booking_requests").select("contact_email").eq("id", first.request_id).single();
  const { data: secondRow } = await db.from("booking_requests").select("contact_email").eq("id", second.request_id).single();

  await login(page, ADMIN, "en");
  await page.goto("/en/admin/requests", { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=request-table]")).toContainText(first.reference);

  // First request: review, assign the Hamburg Room, recalculate, confirm with email.
  await page.goto(`/en/admin/requests/${first.request_id}`, { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=room-availability]")).toContainText("Hamburg Room");
  await page.click("[data-testid=request-action-under_review]");
  await page.getByRole("dialog").locator("[data-testid=confirm-status]").click();
  await expect.poll(async () => (await db.from("booking_requests").select("status").eq("id", first.request_id).single()).data?.status).toBe("under_review");

  const hamburg = (await db.from("rooms").select("id").eq("slug", "hamburg-room").single()).data!.id;
  await page.selectOption("[data-testid=assign-room]", hamburg);
  await page.click("[data-testid=save-request-details]");
  await expect.poll(async () => (await db.from("booking_requests").select("assigned_room_id, quote_gross").eq("id", first.request_id).single()).data).toEqual({ assigned_room_id: hamburg, quote_gross: 63 });

  // Manual price adjustment needs a reason and is recorded.
  await page.click("[data-testid=adjust-price]");
  const adjust = page.getByRole("dialog");
  await adjust.locator("#pa-amount").fill("60.00");
  await adjust.locator("#pa-reason").fill("Regular customer discount");
  await adjust.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("[data-testid=quote-gross]")).toHaveText("€60.00");
  await expect(page.locator("[data-testid=request-history]")).toContainText("Regular customer discount");

  await page.click("[data-testid=request-action-confirmed]");
  const confirm = page.getByRole("dialog");
  await confirm.locator("#st-message").fill("See you soon!");
  await confirm.locator("[data-testid=confirm-status]").click();
  await expect(page.locator("[data-testid=linked-booking]")).toBeVisible();
  const { data: booking } = await db.from("bookings").select("status, room_id, booking_reference").eq("booking_reference", first.reference).single();
  expect(booking).toEqual({ status: "confirmed", room_id: hamburg, booking_reference: first.reference });
  const mail = await waitForEmail(firstRow!.contact_email, new RegExp(`Your booking ${first.reference} is confirmed`));
  expect(mail.html).toContain("Hamburg Room");
  expect(mail.html).toContain("See you soon!");

  // Second request overlaps (10:00–12:00): confirming the same room fails, nothing is double booked.
  await page.goto(`/de/admin/requests/${second.request_id}`, { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=room-availability]")).toContainText(first.reference);
  await page.selectOption("[data-testid=assign-room]", hamburg);
  await page.click("[data-testid=save-request-details]");
  await expect.poll(async () => (await db.from("booking_requests").select("assigned_room_id").eq("id", second.request_id).single()).data?.assigned_room_id).toBe(hamburg);
  await page.reload({ waitUntil: "networkidle" });
  await page.click("[data-testid=request-action-confirmed]");
  await page.getByRole("dialog").locator("[data-testid=confirm-status]").click();
  await expect(page.getByRole("dialog")).toContainText(/bereits gebucht|belegt|vergeben|taken/i);
  const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("room_id", hamburg).eq("start_at", berlin(day, "10:00"));
  expect(count).toBe(0);

  // Propose an alternative instead, in German.
  await page.keyboard.press("Escape");
  await page.click("[data-testid=request-action-alternative_proposed]");
  const alt = page.getByRole("dialog");
  await alt.locator("#alt-start").selectOption("13:00");
  await alt.locator("#st-message").fill("Wie wäre es am Nachmittag?");
  await alt.locator("[data-testid=confirm-status]").click();
  await expect.poll(async () => (await db.from("booking_requests").select("status").eq("id", second.request_id).single()).data?.status).toBe("alternative_proposed");
  const altMail = await waitForEmail(secondRow!.contact_email, new RegExp(`Alternativer Termin für Ihre Anfrage ${second.reference}`));
  expect(altMail.html).toContain("13:00");
  expect(altMail.html).toContain("Wie wäre es am Nachmittag?");

  // Every change is in the history with who did it.
  const { data: events } = await db.from("booking_request_events").select("event_type, to_status, actor_id").eq("request_id", first.request_id);
  expect(events!.map((e) => e.to_status).filter(Boolean)).toEqual(expect.arrayContaining(["under_review", "confirmed"]));
  expect(events!.filter((e) => e.event_type !== "created" && e.event_type !== "email").every((e) => e.actor_id)).toBe(true);
  expect(first.reference).toMatch(REF_PATTERN);
});

test("admin rejects a request and the customer is told in their language", async ({ page }) => {
  const day = (await freeDay("room", "munich-room", "14:00", "16:00", 25)).day;
  const email = `e2e-req-r-${Date.now()}@example.com`;
  const r = await makeRequest(day, "14:00", 2, 3, "de", email);
  await login(page, ADMIN);
  await page.goto(`/de/admin/requests/${r.request_id}`, { waitUntil: "networkidle" });
  await page.click("[data-testid=request-action-rejected]");
  const dialog = page.getByRole("dialog");
  await dialog.locator("#st-note").fill("Ausgebucht");
  await dialog.locator("[data-testid=confirm-status]").click();
  await expect.poll(async () => (await db.from("booking_requests").select("status").eq("id", r.request_id).single()).data?.status).toBe("rejected");
  await waitForEmail(email, new RegExp(`Ihre Buchungsanfrage ${r.reference}`));
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=request-history]")).toContainText("Ausgebucht");

  // The calendar view shows requests.
  await page.goto("/de/admin/requests?view=calendar", { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=request-calendar] .fc")).toBeVisible();
});
