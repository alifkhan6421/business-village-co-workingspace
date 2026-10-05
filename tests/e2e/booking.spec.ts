import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { MEMBER, REF_PATTERN, berlin, db, deleteBookings, freeDay, login, pickSlot, waitForEmail } from "./helpers";

const created: string[] = [];
test.afterAll(async () => deleteBookings(created));

for (const c of [
  { locale: "de", path: "/de/besprechungsraeume/berlin-room", slug: "berlin-room", subject: /Ihre Buchung im Business Village ist bestätigt/, cancelSubject: /Buchung storniert/, manage: /\/de\/buchung\/verwalten\// },
  { locale: "en", path: "/en/meeting-rooms/focus-room", slug: "focus-room", subject: /Your Business Village booking is confirmed/, cancelSubject: /Booking cancelled/, manage: /\/en\/booking\/manage\// },
] as const) {
  test(`guest books, receives email, manages and cancels (${c.locale})`, async ({ page }) => {
    const { day } = await freeDay("room", c.slug, "10:00", "11:00");
    const email = `e2e-guest-${Date.now()}@example.com`;

    await page.goto(c.path, { waitUntil: "networkidle" });
    await pickSlot(page, day, "10:00", "11:00", "continue-to-details");
    await page.click("[data-testid=continue-to-details]");
    await page.fill("#g-first", "Erika");
    await page.fill("#g-last", "Muster");
    await page.fill("#g-email", email);
    await page.click("[data-testid=continue-to-review]");
    await page.click("[data-testid=confirm-booking]");

    await page.waitForURL(c.manage, { timeout: 30_000 });
    const reference = (await page.textContent("[data-testid=booking-reference]"))!.trim();
    created.push(reference);
    expect(reference).toMatch(REF_PATTERN);
    await expect(page.locator("[data-testid=booking-status]")).toHaveText(c.locale === "de" ? "Bestätigt" : "Confirmed");
    await expect(page.locator("body")).toContainText("10:00");

    // The confirmation email is in the booking's language and links to the same manage page.
    const mail = await waitForEmail(email, c.subject);
    expect(mail.html).toContain(reference);
    const link = mail.html.match(/href="([^"]*\/(?:buchung\/verwalten|booking\/manage)\/[^"]+)"/)?.[1];
    expect(link).toBeTruthy();
    expect(new URL(link!.replace(/&amp;/g, "&")).pathname).toBe(new URL(page.url()).pathname);

    // The token is stored hashed, never in plain text.
    const token = new URL(page.url()).pathname.split("/").pop()!;
    const { data: row } = await db.from("bookings").select("management_token_hash").eq("booking_reference", reference).single();
    expect(row!.management_token_hash).toBeTruthy();
    expect(row!.management_token_hash).not.toContain(token);

    // Cancel through the manage link.
    await page.click("[data-testid=cancel-booking]");
    await page.getByRole("alertdialog").getByRole("button", { name: c.locale === "de" ? "Buchung stornieren" : "Cancel booking" }).click();
    await expect(page.locator("[data-testid=booking-status]")).toHaveText(c.locale === "de" ? "Storniert" : "Cancelled");
    await waitForEmail(email, c.cancelSubject);
  });
}

test("taken slot is refused and shown as booked", async ({ page }) => {
  const { day, resourceId } = await freeDay("room", "munich-room", "13:00", "16:00");
  const { data, error } = await db.rpc("create_guest_booking", {
    p_type: "room", p_resource_id: resourceId,
    p_start: berlin(day, "13:00"), p_end: berlin(day, "16:00"),
    p_first_name: "Block", p_last_name: "Er", p_email: `e2e-blocker-${Date.now()}@example.com`,
    p_phone: null, p_company: null, p_purpose: null, p_attendees: 1, p_locale: "de", p_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
  });
  expect(error).toBeNull();
  created.push(data![0].booking_reference);

  await page.goto("/en/meeting-rooms/munich-room", { waitUntil: "networkidle" });
  await pickSlot(page, day, "14:00", "15:00", "continue-to-details");
  await page.click("[data-testid=continue-to-details]");
  await page.fill("#g-first", "Late");
  await page.fill("#g-last", "Comer");
  await page.fill("#g-email", `e2e-late-${Date.now()}@example.com`);
  await page.click("[data-testid=continue-to-review]");
  await page.click("[data-testid=confirm-booking]");
  await expect(page.getByText(/just taken|already been booked/i).first()).toBeVisible();
  expect(page.url()).toContain("/meeting-rooms/munich-room");
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
