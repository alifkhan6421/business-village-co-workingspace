import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const ADMIN = { email: "admin@business-village.de", password: "DemoAdmin123!" };
export const MEMBER = { email: "member@business-village.de", password: "DemoMember123!" };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url ?? "") && process.env.ALLOW_REMOTE_TESTS !== "1") {
  throw new Error(`Refusing to run e2e tests against ${url}. Set ALLOW_REMOTE_TESTS=1 for a non-production test project.`);
}

/** Service-role client for fixtures and clean-up only (never sent to the browser). */
export const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

export const MAIL_API = process.env.EMAIL_API_BASE_URL ?? "http://127.0.0.1:4010";

export type SentEmail = { to: string[]; subject: string; html: string; text?: string };

/** Emails captured by the local mock email API (tests/mock-email-server.mjs). */
export async function sentEmails(to: string): Promise<SentEmail[]> {
  const res = await fetch(`${MAIL_API}/emails`).catch(() => null);
  if (!res?.ok) return [];
  const all = (await res.json()) as SentEmail[];
  return all.filter((m) => m.to.some((x) => x.toLowerCase() === to.toLowerCase()));
}

export async function waitForEmail(to: string, subject: RegExp) {
  let found: SentEmail | undefined;
  await expect
    .poll(async () => {
      found = (await sentEmails(to)).find((m) => subject.test(m.subject));
      return !!found;
    }, { timeout: 20_000 })
    .toBe(true);
  return found!;
}

export async function login(page: Page, who: { email: string; password: string }, locale: "de" | "en" = "de") {
  await page.goto(locale === "de" ? "/de/anmelden" : "/en/login");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !/anmelden|login/.test(u.pathname), { timeout: 60_000 });
}

/** A Monday–Friday at least `minDays` from today, as YYYY-MM-DD. */
export function weekdayAhead(minDays: number) {
  const d = new Date(Date.now() + minDays * 86400000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Berlin wall-clock time to a UTC ISO string (handles DST). */
export function berlin(date: string, time: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(guess)
    .split(":")
    .map(Number);
  const [th, tm] = time.split(":").map(Number);
  return new Date(guess.getTime() - (h * 60 + m - (th * 60 + tm)) * 60000).toISOString();
}

/** First weekday from `minDays` on where the resource is free between start and end (Berlin time). */
export async function freeDay(type: "room" | "workspace", slug: string, start: string, end: string, minDays = 10) {
  const { data: res } = await db.from(type === "room" ? "rooms" : "workspaces").select("id").eq("slug", slug).single();
  for (let offset = minDays; offset < minDays + 120; offset++) {
    const day = weekdayAhead(offset);
    const { data } = await db.rpc("get_busy_slots", { p_type: type, p_resource_id: res!.id, p_from: berlin(day, start), p_to: berlin(day, end) });
    if ((data ?? []).length === 0) return { day, resourceId: res!.id as string };
  }
  throw new Error(`no free day for ${slug}`);
}

/** Removes bookings (and their guests) created by a test, by reference. */
export async function deleteBookings(references: string[]) {
  if (!references.length) return;
  const { data } = await db.from("bookings").select("id, guest_id").in("booking_reference", references);
  const ids = (data ?? []).map((b) => b.id);
  if (!ids.length) return;
  await db.from("booking_messages").delete().in("booking_id", ids);
  await db.from("booking_notes").delete().in("booking_id", ids);
  await db.from("bookings").delete().in("id", ids);
  const guests = [...new Set((data ?? []).map((b) => b.guest_id).filter(Boolean))] as string[];
  for (const g of guests) {
    const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("guest_id", g);
    if (!count) await db.from("guests").delete().eq("id", g);
  }
}

export async function pageIdBySlug(slug: string) {
  const { data } = await db.from("pages").select("id").eq("slug", slug).single();
  return data!.id as string;
}

/** Opens a section in the admin page editor and returns its locator. */
export async function openSection(page: Page, pageSlug: string, type: string) {
  await page.goto(`/de/admin/website/pages/${await pageIdBySlug(pageSlug)}`, { waitUntil: "networkidle" });
  const section = page.locator(`[data-testid=section-${type}]`).first();
  await section.locator("[data-testid=section-toggle]").click();
  return section;
}

export const REF_PATTERN = /^BV-\d{4}-\d{6}$/;

/** Waits for the success toast that admin forms show after saving (optionally with a given text). */
export async function expectSaved(page: Page, text?: RegExp) {
  const toast = page.locator("[data-sonner-toast][data-type=success]");
  await expect((text ? toast.filter({ hasText: text }) : toast).first()).toBeVisible();
}

/** Picks a slot in the booking panel once the widget is hydrated (the calendar renders client-side). */
export async function pickSlot(page: Page, day: string, start: string, end: string, button: "continue-to-details" | "continue-to-review") {
  await page.locator(".fc").first().waitFor({ timeout: 60_000 });
  await expect(async () => {
    await page.fill("#bk-date", day);
    await page.selectOption("#bk-start", start);
    await page.selectOption("#bk-end", end);
    await expect(page.locator(`[data-testid=${button}]`)).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}
