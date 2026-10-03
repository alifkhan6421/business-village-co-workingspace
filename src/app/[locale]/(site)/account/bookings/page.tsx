import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingRow } from "@/components/account/booking-row";
import { FormAlert } from "@/components/forms/form-alert";
import { getMyBookings } from "@/lib/account";
import { getSiteSettings } from "@/lib/cms";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ new?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("bookings"), robots: { index: false } };
}

export default async function MyBookingsPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const { new: newRef } = await searchParams;
  const [t, bookings, settings] = await Promise.all([getTranslations({ locale, namespace: "account" }), getMyBookings(), getSiteSettings(locale)]);
  const now = Date.now();
  const cutoff = settings.cancellation_cutoff_hours * 3600_000;
  const active = (s: string) => s === "confirmed" || s === "pending";
  const upcoming = bookings.filter((b) => active(b.status) && new Date(b.end).getTime() > now);
  const past = bookings.filter((b) => !active(b.status) ? b.status !== "cancelled" : new Date(b.end).getTime() <= now).reverse();
  const cancelled = bookings.filter((b) => b.status === "cancelled").reverse();

  const list = (items: typeof bookings, empty: string, allowCancel = false) =>
    items.length ? (
      <ul className="space-y-3">
        {items.map((b) => (
          <BookingRow key={b.id} booking={b} locale={locale} cancellable={allowCancel && new Date(b.start).getTime() - cutoff > now} />
        ))}
      </ul>
    ) : (
      <EmptyState title={empty} />
    );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("bookings")}</h1>
      {newRef ? <FormAlert kind="success">{t("newBookingToast", { reference: newRef })}</FormAlert> : null}
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">{t("upcoming")} ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">{t("past")} ({past.length})</TabsTrigger>
          <TabsTrigger value="cancelled">{t("cancelledTab")} ({cancelled.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">{list(upcoming, t("noUpcoming"), true)}</TabsContent>
        <TabsContent value="past">{list(past, t("noPast"))}</TabsContent>
        <TabsContent value="cancelled">{list(cancelled, t("noCancelled"))}</TabsContent>
      </Tabs>
    </div>
  );
}
