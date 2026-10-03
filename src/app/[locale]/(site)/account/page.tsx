import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Building2, CalendarPlus, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { BookingRow } from "@/components/account/booking-row";
import { requireUser } from "@/lib/auth";
import { getActiveAnnouncements, getMyBookings } from "@/lib/account";
import { getSiteSettings } from "@/lib/cms";
import { localizeHref } from "@/lib/href";
import { FormAlert } from "@/components/forms/form-alert";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ welcome?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AccountPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const { welcome } = await searchParams;
  const { profile } = await requireUser(locale);
  const [t, ta, f, bookings, news, settings] = await Promise.all([
    getTranslations({ locale, namespace: "account" }),
    getTranslations({ locale, namespace: "auth" }),
    getFormatter({ locale }),
    getMyBookings(),
    getActiveAnnouncements(locale),
    getSiteSettings(locale),
  ]);
  const now = Date.now();
  const cutoff = settings.cancellation_cutoff_hours * 3600_000;
  const upcoming = bookings.filter((b) => ["confirmed", "pending"].includes(b.status) && new Date(b.end).getTime() > now);

  return (
    <div className="space-y-8">
      {welcome ? <FormAlert kind="success">{ta("welcomeVerified")}</FormAlert> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="account-welcome">{t("welcome", { name: profile.first_name || profile.email })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("memberSince", { date: f.dateTime(new Date(profile.created_at), "long") })} · {t("upcomingCount", { count: upcoming.length })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild><a href={localizeHref("/coworking", locale)}><CalendarPlus /> {t("bookWorkspace")}</a></Button>
          <Button asChild variant="outline"><a href={localizeHref("/meeting-rooms", locale)}><Building2 /> {t("bookRoom")}</a></Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t("nextBookings")}</h2>
            <a className="text-sm text-primary hover:underline" href={localizeHref("/account/bookings", locale)}>{t("viewAll")}</a>
          </div>
          {upcoming.length ? (
            <ul className="space-y-3">
              {upcoming.slice(0, 5).map((b) => (
                <BookingRow key={b.id} booking={b} locale={locale} cancellable={new Date(b.start).getTime() - cutoff > now} />
              ))}
            </ul>
          ) : (
            <EmptyState title={t("noUpcoming")} action={<Button asChild size="sm"><a href={localizeHref("/coworking", locale)}>{t("bookWorkspace")}</a></Button>} />
          )}
        </section>
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-primary" /> {t("announcements")}</CardTitle>
            </CardHeader>
            <CardContent>
              {news.length ? (
                <ul className="space-y-4" data-testid="announcements">
                  {news.map((n) => (
                    <li key={n.id} className="border-l-2 border-brand-gold pl-3">
                      <p className="font-medium">{n.title}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{f.dateTime(new Date(n.publishAt), "short")}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noAnnouncements")}</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
