import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { localizeHref } from "@/lib/href";
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
  const [t, tb, ts, f, bookings, settings] = await Promise.all([
    getTranslations({ locale, namespace: "account" }),
    getTranslations({ locale, namespace: "booking" }),
    getTranslations({ locale, namespace: "status" }),
    getFormatter({ locale }),
    getMyBookings(),
    getSiteSettings(locale),
  ]);
  const fresh = newRef ? bookings.find((b) => b.reference === newRef) : undefined;
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
      <EmptyState icon={<CalendarDays />} title={empty} action={<Button asChild size="sm"><a href={localizeHref("/coworking", locale)}>{tb("bookAnother")}</a></Button>} />
    );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t("bookings")}</h1>
      {fresh ? (
        <section className="rounded-2xl border border-emerald-600/20 bg-emerald-50/60 p-6 sm:p-8" data-testid="booking-success">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-xs">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight">{tb("confirmedTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("newBookingToast", { reference: fresh.reference })}</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 rounded-xl bg-white p-5 text-sm shadow-xs sm:grid-cols-3">
            <div><dt className="text-muted-foreground">{tb("reference")}</dt><dd className="mt-0.5 font-mono font-bold">{fresh.reference}</dd></div>
            <div><dt className="text-muted-foreground">{tb("resource")}</dt><dd className="mt-0.5 font-semibold">{fresh.resourceName}</dd></div>
            <div><dt className="text-muted-foreground">{tb("status")}</dt><dd className="mt-0.5"><Badge variant="success">{ts(`booking.${fresh.status}`)}</Badge></dd></div>
            <div><dt className="text-muted-foreground">{tb("date")}</dt><dd className="mt-0.5 font-semibold">{f.dateTime(new Date(fresh.start), "weekday")}</dd></div>
            <div><dt className="text-muted-foreground">{tb("time")}</dt><dd className="mt-0.5 font-semibold tabular-nums">{tb("timeRange", { start: f.dateTime(new Date(fresh.start), "time"), end: f.dateTime(new Date(fresh.end), "time") })}</dd></div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild><a href={localizeHref("/coworking", locale)}>{tb("bookAnother")}</a></Button>
            <Button asChild variant="outline"><a href={`/${locale}`}>{tb("backToHome")}</a></Button>
          </div>
        </section>
      ) : newRef ? (
        <FormAlert kind="success">{t("newBookingToast", { reference: newRef })}</FormAlert>
      ) : null}
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
