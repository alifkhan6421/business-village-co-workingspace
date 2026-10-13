import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookingRequestForm } from "@/components/booking/booking-request-form";
import { getSiteSettings } from "@/lib/cms";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadPricingConfig } from "@/lib/pricing/load";
import { todayBerlin } from "@/lib/time";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "request" });
  return buildMetadata({ locale, internalPath: "/booking-request", title: t("metaTitle"), description: t("metaDescription") });
}

const int = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/** The single entry point for meeting room bookings: pricing page, room pages and header all link here. */
export default async function BookingRequestPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const q = await searchParams;
  const s = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  const supabase = await createClient();
  const [t, settings, config, current] = await Promise.all([
    getTranslations({ locale, namespace: "request" }),
    getSiteSettings(locale),
    loadPricingConfig({ client: supabase }),
    getCurrentUser(),
  ]);

  let room: { slug: string; name: string; capacity: number } | null = null;
  const roomSlug = s("room");
  if (roomSlug && /^[a-z0-9-]{1,80}$/.test(roomSlug)) {
    const { data } = await supabase.from("rooms").select("slug, name, capacity").eq("slug", roomSlug).maybeSingle();
    room = data ?? null;
  }
  const date = s("date");
  const start = s("start");

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-lg text-foreground/75">{t("intro")}</p>
      </header>
      <BookingRequestForm
        config={config}
        settings={{
          dayStart: settings.booking_day_start.slice(0, 5),
          dayEnd: settings.booking_day_end.slice(0, 5),
          slotMinutes: settings.booking_slot_minutes,
          weekdays: settings.booking_weekdays,
          maxHours: settings.booking_max_hours,
          maxDaysAhead: settings.booking_max_days_ahead,
          today: todayBerlin(),
        }}
        initial={{
          date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
          start: start && /^([01]\d|2[0-3]):[0-5]\d$/.test(start) ? start : undefined,
          hours: int(s("hours"), 1, 24),
          participants: int(s("participants"), 1, 1000),
          option: s("option")?.slice(0, 100),
        }}
        room={room}
        user={
          current
            ? { name: current.profile.full_name ?? "", email: current.profile.email, phone: current.profile.phone ?? "", company: current.profile.company ?? "" }
            : null
        }
      />
    </div>
  );
}
