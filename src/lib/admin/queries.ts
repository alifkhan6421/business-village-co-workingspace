import "server-only";
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
