import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

/** Booking with customer and resource, for admin lists and detail pages. */
export const BOOKING_SELECT =
  "*, workspace:workspaces(id, name, slug), room:rooms(id, name, slug), guest:guests(id, first_name, last_name, email, phone, company, locale), member:profiles!bookings_user_id_fkey(id, first_name, last_name, full_name, email, phone, company, preferred_locale)";

export type AdminBooking = Tables<"bookings"> & {
  workspace: { id: string; name: string; slug: string } | null;
  room: { id: string; name: string; slug: string } | null;
  guest: { id: string; first_name: string; last_name: string; email: string; phone: string | null; company: string | null; locale: string } | null;
  member: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    company: string | null;
    preferred_locale: string;
  } | null;
};

export function customerOf(b: AdminBooking) {
  if (b.member) {
    return {
      kind: "member" as const,
      id: b.member.id,
      name: b.member.full_name || `${b.member.first_name} ${b.member.last_name}`.trim() || b.member.email,
      email: b.member.email,
      phone: b.member.phone,
      company: b.member.company,
    };
  }
  if (b.guest) {
    return {
      kind: "guest" as const,
      id: b.guest.id,
      name: `${b.guest.first_name} ${b.guest.last_name}`.trim(),
      email: b.guest.email,
      phone: b.guest.phone,
      company: b.guest.company,
    };
  }
  return { kind: "guest" as const, id: "", name: "—", email: "", phone: null, company: null };
}

export function resourceName(b: AdminBooking) {
  return b.workspace?.name ?? b.room?.name ?? "—";
}

export async function loadResourceOptions() {
  const supabase = await createClient();
  const [ws, rooms] = await Promise.all([
    supabase.from("workspaces").select("id, name, capacity, status").order("display_order").order("name"),
    supabase.from("rooms").select("id, name, capacity, status").order("display_order").order("name"),
  ]);
  return [
    ...(ws.data ?? []).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, type: "workspace" as const })),
    ...(rooms.data ?? []).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, type: "room" as const })),
  ];
}

export async function loadCalendarSettings() {
  const supabase = await createClient();
  const { data: s } = await supabase.from("site_settings").select("booking_day_start, booking_day_end, booking_slot_minutes, booking_weekdays").eq("id", 1).single();
  return {
    dayStart: (s?.booking_day_start ?? "07:00").slice(0, 5),
    dayEnd: (s?.booking_day_end ?? "21:00").slice(0, 5),
    slotMinutes: s?.booking_slot_minutes ?? 30,
    weekdays: s?.booking_weekdays ?? [1, 2, 3, 4, 5],
  };
}
