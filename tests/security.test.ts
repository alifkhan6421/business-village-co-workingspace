/**
 * Security and concurrency checks against a running Supabase instance.
 *
 *   npm run test:security
 *
 * Signs in as anonymous visitor, as the demo member and as a throwaway second
 * member, and verifies that RLS, column grants, storage policies and RPC
 * grants hold. Meeting rooms can only be requested, never booked directly.
 * Then two admins approve 10 booking requests for the same Berlin Room slot
 * (10:00–11:00 Berlin time) at the same time and exactly one may win.
 *
 * Writes test rows (a temporary user, guest and bookings) and removes them
 * again. Refuses to run against a non-local Supabase unless
 * ALLOW_REMOTE_TESTS=1 is set, so it never touches production by accident.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const appUrl = process.env.TEST_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!url || !anonKey || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url) && process.env.ALLOW_REMOTE_TESTS !== "1") {
  console.error(`Refusing to run against ${url}. Set ALLOW_REMOTE_TESTS=1 for a non-production test project.`);
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);

let failures = 0;
let passes = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function signIn(email: string, password: string) {
  const client = createClient(url, anonKey, opts);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return client;
}

/** A read that must return no rows (RLS hides them) or be refused outright. */
async function expectNoRows(client: SupabaseClient, table: string) {
  const { data, error } = await client.from(table).select("*").limit(5);
  assert(error || (data ?? []).length === 0, `${table}: expected no visible rows, got ${data?.length}`);
}

/** A write that must be refused by grants/RLS, or silently affect nothing. */
async function expectWriteBlocked(p: PromiseLike<{ error: unknown; data: unknown; count?: number | null }>, what: string) {
  const { error, data } = await p;
  const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
  assert(error || rows === 0, `${what}: write was not blocked`);
}

async function expectRpcDenied(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { error } = await client.rpc(fn, args);
  assert(error, `${fn}: call was allowed`);
}

/** Next Monday–Friday at least `minDays` ahead, as YYYY-MM-DD. */
function weekdayAhead(minDays: number) {
  const d = new Date(Date.now() + minDays * 86400000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Berlin wall-clock time to a UTC ISO string (handles DST). */
function berlin(date: string, time: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(guess);
  const [h, m] = parts.split(":").map(Number);
  const [th, tm] = time.split(":").map(Number);
  const offsetMin = h * 60 + m - (th * 60 + tm);
  return new Date(guess.getTime() - offsetMin * 60000).toISOString();
}

async function main() {
  const createdBookings: string[] = [];
  const tempEmail = `sec-test-${randomUUID().slice(0, 8)}@example.com`;
  const tempPassword = `T3st-${randomBytes(8).toString("hex")}`;
  const { data: temp, error: tempErr } = await service.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { first_name: "Test", last_name: "Second", preferred_locale: "en", terms_accepted: "true", privacy_accepted: "true" },
  });
  if (tempErr) throw tempErr;
  const tempId = temp.user.id;
  let guestId: string | null = null;
  const createdRequests: string[] = [];

  try {
    const member = await signIn("member@business-village.de", "DemoMember123!");
    const admin = await signIn("admin@business-village.de", "DemoAdmin123!");
    const admin2 = await signIn("admin@business-village.de", "DemoAdmin123!");
    const other = await signIn(tempEmail, tempPassword);
    const { data: me } = await member.auth.getUser();
    const memberId = me.user!.id;
    const { data: berlinRoom } = await service.from("rooms").select("id").eq("slug", "berlin-room").single();
    const roomId = berlinRoom!.id as string;

    // Fixtures: a guest booking and a member booking the attackers try to reach.
    // Meeting rooms are assigned by admins only, so the fixtures are created as admin.
    const fixtureDay = weekdayAhead(30);
    const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const { data: guest, error: guestErr } = await service.from("guests")
      .insert({ first_name: "Sec", last_name: "Guest", email: `sec-guest-${randomUUID().slice(0, 8)}@example.com`, locale: "en" }).select("id").single();
    if (guestErr) throw guestErr;
    guestId = guest.id;
    const { data: g, error: gErr } = await admin.rpc("admin_create_booking", {
      p_type: "room", p_resource_id: roomId, p_start: berlin(fixtureDay, "15:00"), p_end: berlin(fixtureDay, "16:00"),
      p_user_id: null, p_guest_id: guestId, p_attendees: 2, p_purpose: "security test", p_locale: "en",
    });
    if (gErr) throw gErr;
    createdBookings.push(g[0].booking_id);
    const { data: mb, error: mbErr } = await admin.rpc("admin_create_booking", {
      p_type: "room", p_resource_id: roomId, p_start: berlin(fixtureDay, "17:00"), p_end: berlin(fixtureDay, "18:00"),
      p_user_id: memberId, p_guest_id: null, p_attendees: 2, p_purpose: "security test", p_locale: "de",
    });
    if (mbErr) throw mbErr;
    createdBookings.push(mb[0].booking_id);
    const { data: fixtureRequest, error: frErr } = await service.rpc("submit_booking_request", {
      p_start: berlin(fixtureDay, "09:00"), p_end: berlin(fixtureDay, "11:00"), p_duration_hours: 2, p_participants: 4,
      p_full_name: "Sec Requester", p_email: `sec-req-${randomUUID().slice(0, 8)}@example.com`, p_phone: "", p_company: "", p_message: "",
      p_locale: "en", p_user_id: null, p_preferred_room_id: null, p_price_snapshot: null, p_net: null, p_vat: null, p_gross: null,
    });
    if (frErr) throw frErr;
    const requestId = fixtureRequest[0].request_id as string;
    createdRequests.push(requestId);

    console.log("\nAnonymous visitor");
    for (const table of ["guests", "bookings", "contact_requests", "email_logs", "booking_messages", "booking_notes",
      "profiles", "audit_logs", "private_settings", "email_templates", "resource_blocks", "announcements",
      "booking_requests", "booking_request_events"]) {
      await check(`cannot read ${table}`, () => expectNoRows(anon, table));
    }
    await check("cannot insert bookings directly", () =>
      expectWriteBlocked(anon.from("bookings").insert({ booking_type: "room", room_id: roomId, guest_id: guestId, start_at: berlin(fixtureDay, "08:00"), end_at: berlin(fixtureDay, "09:00"), booking_reference: "BV-0000-000000" }).select(), "anon insert booking"));
    await check("cannot call create_guest_booking directly (server-only)", () =>
      expectRpcDenied(anon, "create_guest_booking", { p_type: "room", p_resource_id: roomId, p_start: berlin(fixtureDay, "08:00"), p_end: berlin(fixtureDay, "09:00"), p_first_name: "x", p_last_name: "x", p_email: "x@example.com", p_phone: null, p_company: null, p_purpose: null, p_attendees: 1, p_locale: "de", p_token_hash: "x" }));
    await check("cannot cancel by token directly (server-only)", () => expectRpcDenied(anon, "cancel_booking_by_token", { p_token_hash: tokenHash }));
    await check("cannot call create_member_booking", () =>
      expectRpcDenied(anon, "create_member_booking", { p_type: "room", p_resource_id: roomId, p_start: berlin(fixtureDay, "08:00"), p_end: berlin(fixtureDay, "09:00") }));
    await check("cannot generate booking references", () => expectRpcDenied(anon, "next_booking_reference", {}));
    await check("meeting room availability is not public", async () => {
      const { data, error } = await anon.rpc("get_busy_slots", { p_type: "room", p_resource_id: roomId, p_from: berlin(fixtureDay, "00:00"), p_to: berlin(fixtureDay, "23:30") });
      assert(!error, String(error?.message));
      assert((data ?? []).length === 0, `anonymous visitor saw ${data?.length} busy room slots`);
      await expectRpcDenied(anon, "admin_room_availability", { p_start: berlin(fixtureDay, "08:00"), p_end: berlin(fixtureDay, "18:00") });
    });
    await check("cannot submit booking requests directly (server action only)", () =>
      expectRpcDenied(anon, "submit_booking_request", {
        p_start: berlin(fixtureDay, "08:00"), p_end: berlin(fixtureDay, "09:00"), p_duration_hours: 1, p_participants: 1,
        p_full_name: "x", p_email: "x@example.com", p_phone: "", p_company: "", p_message: "", p_locale: "de",
        p_user_id: null, p_preferred_room_id: null, p_price_snapshot: null, p_net: null, p_vat: null, p_gross: null,
      }));
    await check("cannot insert booking requests directly", () =>
      expectWriteBlocked(anon.from("booking_requests").insert({ reference: "BV-0000-000001", contact_name: "x", contact_email: "x@example.com", start_at: berlin(fixtureDay, "08:00"), end_at: berlin(fixtureDay, "09:00"), duration_hours: 1, participants: 1 }).select(), "anon insert request"));
    await check("reads only active prices and cannot change them", async () => {
      const { data: plans } = await anon.from("price_hourly_plans").select("active");
      assert((plans ?? []).length > 0 && plans!.every((p) => p.active), "inactive or no plans visible");
      const { data: pkgs } = await anon.from("price_packages").select("active");
      assert((pkgs ?? []).every((p) => p.active), "inactive packages visible");
      await expectWriteBlocked(anon.from("price_hourly_tiers").update({ hourly_rate: 1 }).neq("hours", 0).select(), "anon update tiers");
      await expectWriteBlocked(anon.from("pricing_settings").update({ vat_rate: 0 }).eq("id", 1).select(), "anon update vat");
    });
    await check("cannot change site settings", () => expectWriteBlocked(anon.from("site_settings").update({ business_name: "hacked" }).eq("id", 1).select(), "anon update settings"));
    await check("cannot submit contact requests directly (server action only)", () =>
      expectWriteBlocked(anon.from("contact_requests").insert({ name: "x", email: "x@example.com", message: "x" }).select(), "anon insert contact"));
    await check("cannot upload to media storage", async () => {
      const { error } = await anon.storage.from("media").upload(`attack/${randomUUID()}.png`, Buffer.from("x"), { contentType: "image/png" });
      assert(error, "upload allowed");
    });

    console.log("\nMember");
    await check("sees own bookings only", async () => {
      const { data, error } = await member.from("bookings").select("id, user_id");
      assert(!error, String(error?.message));
      assert(data.length > 0, "expected own bookings");
      assert(data.every((b) => b.user_id === memberId), "member sees bookings of others");
    });
    await check("second member cannot see the first member's bookings", async () => {
      const { data } = await other.from("bookings").select("id").in("id", createdBookings);
      assert((data ?? []).length === 0, "foreign bookings visible");
    });
    await check("cannot book meeting rooms directly", async () => {
      const { error } = await member.rpc("create_member_booking", { p_type: "room", p_resource_id: roomId, p_start: berlin(fixtureDay, "08:00"), p_end: berlin(fixtureDay, "09:00"), p_attendees: 2, p_purpose: "x", p_locale: "de" });
      assert(error?.message === "room_requests_only", `expected room_requests_only, got ${error?.message ?? "success"}`);
      const { error: gErr2 } = await service.rpc("create_guest_booking", {
        p_type: "room", p_resource_id: roomId, p_start: berlin(fixtureDay, "08:00"), p_end: berlin(fixtureDay, "09:00"),
        p_first_name: "x", p_last_name: "x", p_email: "x@example.com", p_phone: null, p_company: null, p_purpose: null, p_attendees: 1, p_locale: "de", p_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      });
      assert(gErr2?.message === "room_requests_only", `guest room booking: ${gErr2?.message ?? "success"}`);
    });
    await check("cannot see other people's booking requests or their history", async () => {
      const { data } = await member.from("booking_requests").select("id").eq("id", requestId);
      assert((data ?? []).length === 0, "foreign request visible");
      await expectNoRows(member, "booking_request_events");
    });
    await check("cannot change booking requests or prices", async () => {
      await expectWriteBlocked(member.from("booking_requests").update({ status: "confirmed" }).eq("id", requestId).select(), "member update request");
      await expectRpcDenied(member, "admin_set_booking_request_status", { p_request_id: requestId, p_status: "confirmed" });
      await expectRpcDenied(member, "admin_adjust_booking_request_price", { p_request_id: requestId, p_net: 1, p_vat: 0, p_gross: 1, p_reason: "x" });
      await expectRpcDenied(member, "admin_room_availability", { p_start: berlin(fixtureDay, "08:00"), p_end: berlin(fixtureDay, "18:00") });
      await expectWriteBlocked(member.from("price_packages").update({ price: 1 }).neq("price", -1).select(), "member update packages");
    });
    await check("cannot read guests", () => expectNoRows(member, "guests"));
    await check("cannot read contact requests", () => expectNoRows(member, "contact_requests"));
    await check("cannot read email logs", () => expectNoRows(member, "email_logs"));
    await check("cannot read booking messages or notes", async () => {
      await expectNoRows(member, "booking_messages");
      await expectNoRows(member, "booking_notes");
    });
    await check("cannot read audit log or private settings", async () => {
      await expectNoRows(member, "audit_logs");
      await expectNoRows(member, "private_settings");
    });
    await check("sees only own profile", async () => {
      const { data } = await member.from("profiles").select("id");
      assert((data ?? []).length === 1 && data![0].id === memberId, `saw ${data?.length} profiles`);
    });
    await check("cannot promote self via profile update", async () => {
      await member.from("profiles").update({ role: "admin" }).eq("id", memberId);
      const { data } = await service.from("profiles").select("role").eq("id", memberId).single();
      assert(data!.role === "member", "role changed!");
    });
    await check("cannot promote self via admin_set_user_role", () => expectRpcDenied(member, "admin_set_user_role", { p_user_id: memberId, p_role: "admin" }));
    await check("cannot edit another member's profile", async () => {
      await member.from("profiles").update({ first_name: "Hacked" }).eq("id", tempId);
      const { data } = await service.from("profiles").select("first_name").eq("id", tempId).single();
      assert(data!.first_name === "Test", "foreign profile changed");
    });
    await check("cannot update or delete bookings directly", async () => {
      await expectWriteBlocked(member.from("bookings").update({ status: "cancelled" }).eq("id", mb[0].booking_id).select(), "member update booking");
      await expectWriteBlocked(member.from("bookings").delete().eq("id", mb[0].booking_id).select(), "member delete booking");
    });
    await check("cannot cancel someone else's booking", async () => {
      await other.rpc("cancel_my_booking", { p_booking_id: mb[0].booking_id });
      const { data } = await service.from("bookings").select("status").eq("id", mb[0].booking_id).single();
      assert(data!.status === "confirmed", "foreign booking cancelled");
    });
    await check("cannot call admin RPCs", async () => {
      await expectRpcDenied(member, "admin_create_booking", { p_type: "room", p_resource_id: roomId, p_start: berlin(fixtureDay, "08:00"), p_end: berlin(fixtureDay, "09:00"), p_user_id: memberId, p_guest_id: null, p_attendees: 1, p_purpose: null, p_locale: "de" });
      await expectRpcDenied(member, "admin_cancel_booking", { p_booking_id: g[0].booking_id, p_reason: "x" });
      await expectRpcDenied(member, "admin_create_block", { p_type: "room", p_resource_id: roomId, p_start: berlin(fixtureDay, "08:00"), p_end: berlin(fixtureDay, "09:00"), p_reason: "maintenance", p_note: null });
      await expectRpcDenied(member, "admin_set_booking_token", { p_booking_id: g[0].booking_id, p_token_hash: "x" });
      await expectRpcDenied(member, "admin_utilization", { p_from: berlin(fixtureDay, "00:00"), p_to: berlin(fixtureDay, "23:30") });
      await expectRpcDenied(member, "admin_set_gallery", { p_type: "room", p_resource_id: roomId, p_media_ids: [], p_cover_id: null });
      await expectRpcDenied(member, "admin_set_amenities", { p_type: "room", p_resource_id: roomId, p_amenity_ids: [] });
      await expectRpcDenied(member, "log_admin_activity", { p_action: "x", p_entity_type: "x", p_entity_id: null, p_metadata: {} });
    });
    await check("cannot write CMS, resources, amenities or settings", async () => {
      await expectWriteBlocked(member.from("rooms").update({ name: "Hacked" }).eq("id", roomId).select(), "member update room");
      await expectWriteBlocked(member.from("pages").insert({ slug: "hacked", page_type: "custom" }).select(), "member insert page");
      await expectWriteBlocked(member.from("amenities").insert({ icon: "x" }).select(), "member insert amenity");
      await expectWriteBlocked(member.from("site_settings").update({ business_name: "hacked" }).eq("id", 1).select(), "member update settings");
      await expectWriteBlocked(member.from("media").delete().neq("id", randomUUID()).select(), "member delete media");
    });
    await check("cannot upload or delete in media storage", async () => {
      const { error } = await member.storage.from("media").upload(`attack/${randomUUID()}.png`, Buffer.from("x"), { contentType: "image/png" });
      assert(error, "upload allowed");
      const { data: objs } = await service.storage.from("media").list("demo", { limit: 1 });
      if (objs?.length) {
        const { data } = await member.storage.from("media").remove([`demo/${objs[0].name}`]);
        assert((data ?? []).length === 0, "member deleted a media object");
      }
    });

    console.log("\nHTTP");
    const reachable = await fetch(appUrl, { redirect: "manual" }).then(() => true, () => false);
    if (!reachable) {
      console.log(`  - app not reachable at ${appUrl}, skipping HTTP checks`);
    } else {
      await check("admin area redirects anonymous visitors to sign-in", async () => {
        const res = await fetch(`${appUrl}/de/admin`, { redirect: "manual" });
        assert(res.status >= 300 && res.status < 400, `status ${res.status}`);
        assert(/anmelden|login/.test(res.headers.get("location") ?? ""), `location ${res.headers.get("location")}`);
      });
      await check("unknown guest token shows no booking", async () => {
        const res = await fetch(`${appUrl}/en/booking/manage/${randomBytes(32).toString("base64url")}`);
        const html = await res.text();
        assert(!html.includes("BV-20"), "a booking reference leaked");
      });
      await check("inbound webhook rejects unsigned requests", async () => {
        const res = await fetch(`${appUrl}/api/webhooks/resend`, { method: "POST", body: JSON.stringify({ type: "email.received", data: {} }), headers: { "content-type": "application/json" } });
        assert(res.status === 401 || res.status === 503, `status ${res.status}`);
      });
      await check("no secrets in the client bundle", async () => {
        const html = await (await fetch(`${appUrl}/de`)).text();
        const scripts = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
        for (const s of scripts) {
          const js = await (await fetch(`${appUrl}${s}`)).text();
          assert(!js.includes(serviceKey), `service role key found in ${s}`);
          if (process.env.RESEND_API_KEY) assert(!js.includes(process.env.RESEND_API_KEY), `Resend key found in ${s}`);
          if (process.env.RESEND_WEBHOOK_SECRET) assert(!js.includes(process.env.RESEND_WEBHOOK_SECRET), `webhook secret found in ${s}`);
        }
      });
    }

    console.log("\nConcurrency: 10 requests for Berlin Room 10:00–11:00, approved at the same time by two admins");
    await check("exactly one approval wins", async () => {
      // Find a weekday where the slot is still free.
      let day = "";
      for (let offset = 14; offset < 120 && !day; offset++) {
        const candidate = weekdayAhead(offset);
        const { data } = await service.rpc("get_busy_slots", { p_type: "room", p_resource_id: roomId, p_from: berlin(candidate, "10:00"), p_to: berlin(candidate, "11:00") });
        if ((data ?? []).length === 0) day = candidate;
      }
      assert(day, "no free day found");
      const start = berlin(day, "10:00");
      const end = berlin(day, "11:00");
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        const { data, error } = await service.rpc("submit_booking_request", {
          p_start: start, p_end: end, p_duration_hours: 1, p_participants: 2,
          p_full_name: `Race ${i}`, p_email: `race-${i}-${randomUUID().slice(0, 6)}@example.com`, p_phone: "", p_company: "", p_message: "",
          p_locale: "en", p_user_id: null, p_preferred_room_id: null, p_price_snapshot: null, p_net: null, p_vat: null, p_gross: null,
        });
        if (error) throw error;
        ids.push(data[0].request_id);
        createdRequests.push(data[0].request_id);
      }
      const { error: assignErr } = await service.from("booking_requests").update({ assigned_room_id: roomId }).in("id", ids);
      if (assignErr) throw assignErr;
      const results = await Promise.all(ids.map((id, i) => (i % 2 ? admin2 : admin).rpc("admin_set_booking_request_status", { p_request_id: id, p_status: "confirmed", p_note: "race" })));
      const winners = results.filter((r) => !r.error);
      for (const w of winners) createdBookings.push(w.data as string);
      const reasons = [...new Set(results.filter((r) => r.error).map((r) => r.error!.message))];
      const { count } = await service.from("bookings").select("id", { count: "exact", head: true })
        .eq("room_id", roomId).eq("start_at", start).in("status", ["pending", "confirmed"]);
      const { count: confirmed } = await service.from("booking_requests").select("id", { count: "exact", head: true }).in("id", ids).eq("status", "confirmed");
      assert(winners.length === 1, `${winners.length} approvals succeeded`);
      assert(count === 1, `${count} active bookings in the database`);
      assert(confirmed === 1, `${confirmed} requests marked confirmed`);
      console.log(`      1 confirmed, 9 refused (${reasons.join(", ")})`);
    });
  } finally {
    // Clean up everything this run created.
    let requestGuests: string[] = [];
    if (createdRequests.length) {
      const { data: reqs } = await service.from("booking_requests").select("guest_id").in("id", createdRequests);
      requestGuests = (reqs ?? []).map((r) => r.guest_id).filter(Boolean) as string[];
      await service.from("booking_requests").delete().in("id", createdRequests);
    }
    if (createdBookings.length) {
      const { data: rows } = await service.from("bookings").select("guest_id").in("id", createdBookings);
      await service.from("booking_messages").delete().in("booking_id", createdBookings);
      await service.from("booking_notes").delete().in("booking_id", createdBookings);
      await service.from("bookings").delete().in("id", createdBookings);
      const guestIds = [...new Set([...(rows ?? []).map((r) => r.guest_id).filter(Boolean), ...requestGuests])] as string[];
      if (guestIds.length) await service.from("guests").delete().in("id", guestIds);
    } else if (requestGuests.length) await service.from("guests").delete().in("id", requestGuests);
    await service.auth.admin.deleteUser(tempId);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
