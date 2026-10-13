import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookingRequestForm } from "@/components/booking-request/request-form";
import { loadPricingConfig } from "@/lib/pricing/server";
import { getSiteSettings } from "@/lib/cms";
import { getCurrentUser } from "@/lib/auth";
import { getResourceBySlug } from "@/lib/resources";
import { todayBerlin } from "@/lib/time";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "request" });
  return buildMetadata({ locale, internalPath: "/booking-request", title: t("title"), description: t("subtitle") });
}

/** The central booking request form: every public booking goes through here. */
export default async function BookingRequestPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [t, config, settings, current] = await Promise.all([
    getTranslations({ locale, namespace: "request" }),
    loadPricingConfig(),
    getSiteSettings(locale),
    getCurrentUser(),
  ]);
  const roomSlug = q("room") && /^[a-z0-9-]{1,80}$/.test(q("room")!) ? q("room") : undefined;
  const room = roomSlug ? await getResourceBySlug("room", roomSlug, locale) : null;
  const num = (v: string | undefined) => (v && /^\d{1,4}$/.test(v) ? Number(v) : undefined);

  return (
    <div>
      <section className="border-b bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl" data-testid="page-title">{t("title")}</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <BookingRequestForm
          config={config}
          settings={{
            dayStart: settings.booking_day_start.slice(0, 5),
            dayEnd: settings.booking_day_end.slice(0, 5),
            slotMinutes: settings.booking_slot_minutes,
            weekdays: settings.booking_weekdays,
            maxDaysAhead: settings.booking_max_days_ahead,
          }}
          today={todayBerlin()}
          initial={{
            date: q("date") && /^\d{4}-\d{2}-\d{2}$/.test(q("date")!) ? q("date") : undefined,
            start: q("start") && /^\d{2}:\d{2}$/.test(q("start")!) ? q("start") : undefined,
            hours: num(q("hours")),
            people: num(q("people")),
            packageId: q("package"),
            spaceType: q("space") === "desk" ? "workspace" : "room",
          }}
          room={room ? { slug: room.slug, name: room.name, capacity: room.capacity } : null}
          user={current ? { name: current.profile.full_name ?? "", email: current.profile.email, phone: current.profile.phone ?? "", company: current.profile.company ?? "" } : null}
        />
      </div>
    </div>
  );
}
