/**
 * Demo setup: demo accounts, placeholder images and member bookings.
 *
 *   npm run seed:demo
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
 * .env.local). Safe to run repeatedly: existing users, images and bookings are
 * kept. Run AFTER the migrations and supabase/seed.sql.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { heroSvg, roomSvg, toWebp, workspaceSvg } from "./demo-images";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const DEMO_USERS = [
  { email: "admin@business-village.de", password: "DemoAdmin123!", role: "admin", first: "Anna", last: "Admin", company: "Business Village" },
  { email: "member@business-village.de", password: "DemoMember123!", role: "member", first: "Max", last: "Mitglied", company: "Mustermann GmbH" },
] as const;

async function ensureUser(u: (typeof DEMO_USERS)[number]) {
  const { data: existing } = await db.from("profiles").select("id").ilike("email", u.email).maybeSingle();
  let id = existing?.id as string | undefined;
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { first_name: u.first, last_name: u.last, company: u.company, preferred_locale: "de", terms_accepted: "true", privacy_accepted: "true" },
    });
    if (error) throw error;
    id = data.user.id;
    console.log(`created ${u.email}`);
  } else {
    console.log(`exists  ${u.email}`);
  }
  // The signup trigger always creates "member"; promote the demo admin here (service role only).
  if (u.role === "admin") {
    const { error } = await db.from("profiles").update({ role: "admin" }).eq("id", id);
    if (error) throw error;
  }
  return id!;
}

async function upload(name: string, svg: string, alt: { de: string; en: string }, title: string) {
  const buf = await toWebp(svg);
  const path = `demo/${name}-${randomUUID().slice(0, 8)}.webp`;
  const { error } = await db.storage.from("media").upload(path, buf, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  const { data: pub } = db.storage.from("media").getPublicUrl(path);
  const { data, error: e2 } = await db
    .from("media")
    .insert({
      file_name: `${name}.webp`,
      file_url: pub.publicUrl,
      storage_path: path,
      mime_type: "image/webp",
      file_size: buf.length,
      width: 1600,
      height: 1200,
      alt_text_de: alt.de,
      alt_text_en: alt.en,
      title,
    })
    .select("id")
    .single();
  if (e2) throw e2;
  return data.id as string;
}

async function seedImages() {
  const { count } = await db.from("media").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.log("media already present, skipping demo images");
    return;
  }
  const { data: workspaces } = await db.from("workspaces").select("id, name").order("display_order");
  for (const [i, w] of (workspaces ?? []).entries()) {
    const a = await upload(`workspace-${w.name}`, workspaceSvg(w.name, i), { de: `Arbeitsplatz ${w.name}`, en: `Workspace ${w.name}` }, w.name);
    const b = await upload(`workspace-${w.name}-2`, workspaceSvg(w.name, i + 1), { de: `Arbeitsplatz ${w.name} – Ansicht 2`, en: `Workspace ${w.name} – view 2` }, `${w.name} (2)`);
    await db.from("workspace_images").insert([
      { workspace_id: w.id, media_id: a, display_order: 0, is_cover: true },
      { workspace_id: w.id, media_id: b, display_order: 1, is_cover: false },
    ]);
  }
  const { data: rooms } = await db.from("rooms").select("id, name").order("display_order");
  for (const [i, r] of (rooms ?? []).entries()) {
    const a = await upload(`room-${r.name}`, roomSvg(r.name, i), { de: `Besprechungsraum ${r.name}`, en: `Meeting room ${r.name}` }, r.name);
    const b = await upload(`room-${r.name}-2`, roomSvg(r.name, i + 2), { de: `${r.name} – weitere Ansicht`, en: `${r.name} – another view` }, `${r.name} (2)`);
    await db.from("room_images").insert([
      { room_id: r.id, media_id: a, display_order: 0, is_cover: true },
      { room_id: r.id, media_id: b, display_order: 1, is_cover: false },
    ]);
  }
  // Homepage hero + landing page headers
  const hero = await upload("hero", heroSvg(0), { de: "Helle Coworking-Fläche im Business Village", en: "Bright coworking space at Business Village" }, "Hero");
  const { data: home } = await db.from("pages").select("id").eq("slug", "home").single();
  if (home) await db.from("page_sections").update({ media_id: hero }).eq("page_id", home.id).eq("section_type", "hero");
  for (const [i, slug] of ["coworking", "meeting-rooms", "amenities"].entries()) {
    const m = await upload(`header-${slug}`, heroSvg(i + 1), { de: "Business Village Innenansicht", en: "Business Village interior" }, `Header ${slug}`);
    const { data: page } = await db.from("pages").select("id").eq("slug", slug).single();
    if (page) await db.from("page_sections").update({ media_id: m }).eq("page_id", page.id).eq("section_type", "page_header");
  }
  console.log("uploaded demo images");
}

function nextWeekday(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function seedMemberBookings(memberId: string) {
  const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("user_id", memberId);
  if ((count ?? 0) > 0) return;
  const { data: berlin } = await db.from("rooms").select("id").eq("slug", "berlin-room").single();
  const { data: a01 } = await db.from("workspaces").select("id").eq("slug", "a-01").single();
  const day1 = nextWeekday(3);
  const day2 = nextWeekday(5);
  const past = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const rows = [
    { room_id: berlin!.id, booking_type: "room", start: `${day1}T08:00:00Z`, end: `${day1}T10:00:00Z`, status: "confirmed", purpose: "Team-Workshop" },
    { workspace_id: a01!.id, booking_type: "workspace", start: `${day2}T07:00:00Z`, end: `${day2}T15:00:00Z`, status: "confirmed", purpose: null },
    { workspace_id: a01!.id, booking_type: "workspace", start: `${past}T07:00:00Z`, end: `${past}T15:00:00Z`, status: "completed", purpose: null },
  ];
  for (const r of rows) {
    const { data: reference, error: refError } = await db.rpc("next_booking_reference");
    if (refError) throw refError;
    const { error } = await db.from("bookings").insert({
      booking_reference: reference,
      booking_type: r.booking_type,
      user_id: memberId,
      workspace_id: "workspace_id" in r ? r.workspace_id : null,
      room_id: "room_id" in r ? r.room_id : null,
      start_at: r.start,
      end_at: r.end,
      status: r.status,
      source: "member",
      locale: "de",
      purpose: r.purpose,
      attendees: r.booking_type === "room" ? 6 : 1,
    });
    if (error && !String(error.message).includes("exclusion")) console.warn("booking:", error.message);
  }
  console.log("created member demo bookings");
}

async function main() {
  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) ids[u.role] = await ensureUser(u);
  await seedImages();
  await seedMemberBookings(ids.member);
  console.log("\nDemo accounts:\n  admin@business-village.de  / DemoAdmin123!\n  member@business-village.de / DemoMember123!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
