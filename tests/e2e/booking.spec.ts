import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { MEMBER, REF_PATTERN, berlin, db, deleteBookings, freeDay, login, pickSlot, waitForEmail } from "./helpers";

const created: string[] = [];
test.afterAll(async () => deleteBookings(created));

// Guests no longer book directly; their flow is covered in requests.spec.ts. Members keep direct booking.

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

  await login(page, MEMBER, "en");
  await page.goto("/en/meeting-rooms/munich-room", { waitUntil: "networkidle" });
  await pickSlot(page, day, "14:00", "15:00", "continue-to-review");
  await page.click("[data-testid=continue-to-review]");
  await page.click("[data-testid=confirm-booking]");
  await expect(page.getByText(/just taken|already been booked/i).first()).toBeVisible();
  expect(page.url()).toContain("/meeting-rooms/munich-room");
});

test("member books a room, sees it in the account and cancels it", async ({ page }) => {
  const { day } = await freeDay("room", "berlin-room", "09:00", "12:00", 21);
  await login(page, MEMBER);
  await page.goto("/de/besprechungsraeume/berlin-room", { waitUntil: "networkidle" });
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
