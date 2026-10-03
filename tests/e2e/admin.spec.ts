import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { ADMIN, REF_PATTERN, db, deleteBookings, expectSaved, freeDay, login, openSection, waitForEmail } from "./helpers";

test.beforeEach(async ({ page }) => login(page, ADMIN));

async function h1(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  return (await page.locator("h1").first().textContent())?.trim();
}

async function editLocalField(page: Page, pageSlug: string, type: string, locale: "de" | "en", key: string, value: string) {
  const section = await openSection(page, pageSlug, type);
  await section.locator(`[data-testid=tab-${locale}]`).click();
  await section.locator(`[data-testid=field-${locale}_${key}]`).fill(value);
  await section.locator("[data-testid=section-save]").click();
  await expectSaved(page);
}

test("CMS hero: editing one language leaves the other untouched", async ({ page }) => {
  const origDe = await h1(page, "/de");
  const origEn = await h1(page, "/en");
  const stamp = Date.now();
  try {
    await editLocalField(page, "home", "hero", "en", "title", `English hero ${stamp}`);
    expect(await h1(page, "/en")).toBe(`English hero ${stamp}`);
    expect(await h1(page, "/de")).toBe(origDe);

    await editLocalField(page, "home", "hero", "de", "title", `Deutscher Hero ${stamp}`);
    expect(await h1(page, "/de")).toBe(`Deutscher Hero ${stamp}`);
    expect(await h1(page, "/en")).toBe(`English hero ${stamp}`);
  } finally {
    await editLocalField(page, "home", "hero", "en", "title", origEn!);
    await editLocalField(page, "home", "hero", "de", "title", origDe!);
  }
  expect(await h1(page, "/de")).toBe(origDe);
  expect(await h1(page, "/en")).toBe(origEn);
});

test("image: uploaded gallery image becomes the room cover and is protected from deletion", async ({ page }) => {
  const { data: room } = await db.from("rooms").select("id").eq("slug", "hamburg-room").single();
  const { data: before } = await db.from("room_images").select("media_id, display_order, is_cover").eq("room_id", room!.id);
  const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 30, g: 120, b: 90 } } }).png().toBuffer();
  let mediaId: string | null = null;
  try {
    await page.goto(`/en/admin/rooms/${room!.id}`, { waitUntil: "networkidle" });
    const gallery = page.locator("[data-testid=gallery-manager]");
    const count = await gallery.locator("[data-testid=gallery-item]").count();
    await gallery.locator("[data-testid=media-upload-input]").setInputFiles({ name: "e2e-cover.png", mimeType: "image/png", buffer: png });
    await expect(gallery.locator("[data-testid=gallery-item]")).toHaveCount(count + 1, { timeout: 30_000 });

    const item = gallery.locator("[data-testid=gallery-item]").last();
    const src = (await item.locator("img").getAttribute("src"))!;
    await item.getByLabel(/German/).fill("Hamburg Raum E2E");
    await item.getByLabel(/English/).fill("Hamburg Room E2E");
    await item.getByRole("button", { name: "Set as cover" }).click();
    await gallery.locator("[data-testid=gallery-save]").click();
    await expectSaved(page, /Gallery saved/i);

    const { data: m } = await db.from("media").select("id").eq("file_url", src).single();
    mediaId = m!.id;

    // Public listing shows the new cover with the localized alt text.
    await page.goto("/en/meeting-rooms", { waitUntil: "networkidle" });
    const card = page.locator("[data-testid=resource-card]", { hasText: "Hamburg" });
    await expect(card.locator("[data-testid=resource-cover]")).toHaveAttribute("alt", "Hamburg Room E2E");
    expect(decodeURIComponent((await card.locator("[data-testid=resource-cover]").getAttribute("src"))!)).toContain(src.split("/").pop()!);
    await page.goto("/de/besprechungsraeume", { waitUntil: "networkidle" });
    await expect(page.locator("[data-testid=resource-card]", { hasText: "Hamburg" }).locator("[data-testid=resource-cover]")).toHaveAttribute("alt", "Hamburg Raum E2E");

    // The media library refuses to delete an image that is in use.
    await page.goto(`/en/admin/media?q=e2e-cover`, { waitUntil: "networkidle" });
    await page.locator("[data-testid=media-grid] img").first().click();
    await page.locator("[data-testid=media-delete]").click();
    await expect(page.getByText(/in use|used/i).first()).toBeVisible();
    const { count: still } = await db.from("media").select("id", { count: "exact", head: true }).eq("id", mediaId!);
    expect(still).toBe(1);
  } finally {
    await db.from("room_images").delete().eq("room_id", room!.id);
    if (before?.length) await db.from("room_images").insert(before.map((b) => ({ ...b, room_id: room!.id })));
    if (mediaId) {
      const { data: m } = await db.from("media").select("storage_path").eq("id", mediaId).single();
      await db.from("media").delete().eq("id", mediaId);
      if (m?.storage_path) await db.storage.from("media").remove([m.storage_path]);
    }
  }
});

test("amenity: 'Podcast Equipment' is created, assigned to a room and shown in both languages", async ({ page }) => {
  const { data: room } = await db.from("rooms").select("id").eq("slug", "munich-room").single();
  try {
    await page.goto("/en/admin/amenities", { waitUntil: "networkidle" });
    await page.click("[data-testid=amenity-new]");
    const form = page.locator("[data-testid=amenity-form]");
    await form.locator("#am-name-de").fill("Podcast-Ausstattung");
    await form.locator("[data-testid=tab-en]").click();
    await form.locator("#am-name-en").fill("Podcast Equipment");
    await form.locator("#am-slug").fill("podcast-equipment");
    await form.locator("#am-type").selectOption("room");
    await form.getByRole("button", { name: /save/i }).click();
    await expect(page.locator("[data-testid=amenity-row-podcast-equipment]")).toBeVisible();

    await page.goto(`/en/admin/rooms/${room!.id}`, { waitUntil: "networkidle" });
    await page.getByLabel("Podcast Equipment").check();
    await page.getByRole("button", { name: /save changes/i }).click();
    await expectSaved(page);

    await page.goto("/en/meeting-rooms/munich-room", { waitUntil: "networkidle" });
    await expect(page.locator("[data-testid=resource-amenities]")).toContainText("Podcast Equipment");
    await page.goto("/de/besprechungsraeume/munich-room", { waitUntil: "networkidle" });
    await expect(page.locator("[data-testid=resource-amenities]")).toContainText("Podcast-Ausstattung");

    // Deactivating hides it publicly but keeps the assignment.
    await page.goto("/en/admin/amenities", { waitUntil: "networkidle" });
    await page.locator("[data-testid=amenity-row-podcast-equipment]").getByRole("switch").click();
    await expect.poll(async () => (await db.from("amenities").select("active").eq("slug", "podcast-equipment").single()).data?.active).toBe(false);
    await page.goto("/en/meeting-rooms/munich-room", { waitUntil: "networkidle" });
    await expect(page.locator("[data-testid=resource-amenities]")).not.toContainText("Podcast Equipment");
  } finally {
    const { data: a } = await db.from("amenities").select("id").eq("slug", "podcast-equipment").maybeSingle();
    if (a) {
      await db.from("room_amenities").delete().eq("amenity_id", a.id);
      await db.from("workspace_amenities").delete().eq("amenity_id", a.id);
      await db.from("amenity_translations").delete().eq("amenity_id", a.id);
      await db.from("amenities").delete().eq("id", a.id);
    }
  }
});

test("contact: changed phone number appears on the contact page and footer; the form stores an inquiry", async ({ page }) => {
  const { data: s } = await db.from("site_settings").select("phone").eq("id", 1).single();
  const original = s!.phone as string;
  const phone = "+49 30 1234 5678";
  const email = `e2e-contact-${Date.now()}@example.com`;
  try {
    await page.goto("/en/admin/settings", { waitUntil: "networkidle" });
    const form = page.locator("[data-testid=business-settings]");
    await form.locator("#bs-phone").fill(phone);
    await form.getByRole("button", { name: /save/i }).click();
    await expectSaved(page);

    for (const path of ["/de/kontakt", "/en/contact"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("[data-testid=contact-phone]")).toHaveText(phone);
      await expect(page.locator("[data-testid=footer-contact]")).toContainText(phone);
    }

    // Visitor sends the contact form (English).
    await page.context().clearCookies();
    await page.goto("/en/contact", { waitUntil: "networkidle" });
    const cf = page.locator("[data-testid=contact-form]");
    await cf.locator("#c-name").fill("Erika Example");
    await cf.locator("#c-email").fill(email);
    await cf.locator("#c-message").fill("We would like to book the Berlin Room every Monday morning.");
    await cf.getByRole("button").last().click();
    await expect(page.locator("[data-testid=contact-success]")).toBeVisible();
    await expect.poll(async () => (await db.from("contact_requests").select("id").eq("email", email)).data?.length).toBe(1);
    await waitForEmail(email, /We have received your message/);
  } finally {
    await db.from("site_settings").update({ phone: original }).eq("id", 1);
    await db.from("contact_requests").delete().eq("email", email);
  }
});

test("imprint: legal details edited in the CMS appear on both language versions", async ({ page }) => {
  const { data: p } = await db.from("pages").select("id").eq("slug", "imprint").single();
  const { data: sec } = await db.from("page_sections").select("id, settings").eq("page_id", p!.id).eq("section_type", "imprint").single();
  const original = sec!.settings;
  const name = `Business Village GmbH ${Date.now()}`;
  try {
    const section = await openSection(page, "imprint", "imprint");
    await section.locator("[data-testid=field-s_legal_name]").fill(name);
    await section.locator("[data-testid=field-s_register_number]").fill("HRB 123456 B");
    await section.locator("[data-testid=section-save]").click();
    await expectSaved(page);

    for (const path of ["/de/impressum", "/en/imprint"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("[data-testid=imprint]")).toContainText(name);
      await expect(page.locator("[data-testid=imprint]")).toContainText("HRB 123456 B");
    }
  } finally {
    await db.from("page_sections").update({ settings: original }).eq("id", sec!.id);
  }
});

test("admin creates a guest booking from the calendar link and cancels it", async ({ page }) => {
  const { day, resourceId } = await freeDay("room", "berlin-room", "16:00", "17:30");
  const email = `e2e-admin-guest-${Date.now()}@example.com`;
  let reference = "";
  try {
    await page.goto(`/en/admin/bookings/new?type=room&resource=${resourceId}&date=${day}&start=16:00&end=17:30`, { waitUntil: "networkidle" });
    await page.getByLabel("Guest").check();
    await page.fill("#first_name", "Greta");
    await page.fill("#last_name", "Gast");
    await page.fill("#g_email", email);
    await page.click("[data-testid=admin-create-booking]");
    await page.waitForURL(/admin\/bookings\/[0-9a-f-]{36}/, { timeout: 30_000 });
    reference = (await page.locator("h1").textContent())!.match(/BV-\d{4}-\d{6}/)![0];
    expect(reference).toMatch(REF_PATTERN);
    await waitForEmail(email, /booking is confirmed/i);

    await page.click("[data-testid=admin-cancel-booking]");
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await dialog.locator("textarea").fill("Room maintenance");
    await dialog.getByRole("button", { name: /cancel booking/i }).click();
    await expect.poll(async () => (await db.from("bookings").select("status").eq("booking_reference", reference).single()).data?.status).toBe("cancelled");
    await waitForEmail(email, new RegExp(`Booking cancelled – ${reference}`));
  } finally {
    if (reference) await deleteBookings([reference]);
  }
});
