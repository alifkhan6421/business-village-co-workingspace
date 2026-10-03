import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { pickLocalized } from "@/lib/localize";

export type MyBooking = {
  id: string;
  reference: string;
  type: "workspace" | "room";
  resourceName: string;
  resourceSlug: string;
  start: string;
  end: string;
  status: string;
  attendees: number;
};

/** The signed-in member's bookings. RLS limits the rows to their own. */
export async function getMyBookings(): Promise<MyBooking[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("bookings")
    .select("id, booking_reference, booking_type, start_at, end_at, status, attendees, workspaces(name, slug), rooms(name, slug)")
    .eq("user_id", user.id)
    .order("start_at", { ascending: true });
  return (data ?? []).map((b) => {
    const r = (b.workspaces ?? b.rooms) as { name: string; slug: string } | null;
    return {
      id: b.id,
      reference: b.booking_reference,
      type: b.booking_type as "workspace" | "room",
      resourceName: r?.name ?? "",
      resourceSlug: r?.slug ?? "",
      start: b.start_at,
      end: b.end_at,
      status: b.status,
      attendees: b.attendees,
    };
  });
}

export async function getActiveAnnouncements(locale: Locale) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("active", true)
    .lte("publish_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("publish_at", { ascending: false });
  return (data ?? []).map((a) => ({
    id: a.id,
    title: pickLocalized(a as unknown as Record<string, unknown>, "title", locale),
    content: pickLocalized(a as unknown as Record<string, unknown>, "content", locale),
    publishAt: a.publish_at,
  }));
}
