import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Building2, CalendarDays, CalendarPlus, Clock, Mail, MapPin, Megaphone, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { BookingRow } from "@/components/account/booking-row";
import { ResourceCard } from "@/components/resources/resource-card";
import { CancelBookingButton } from "@/components/booking/cancel-button";
import { requireUser } from "@/lib/auth";
import { getActiveAnnouncements, getMyBookings } from "@/lib/account";
import { getSiteSettings } from "@/lib/cms";
import { listResources } from "@/lib/resources";
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
  const [t, ta, tb, f, bookings, news, settings, workspaces, rooms] = await Promise.all([
    getTranslations({ locale, namespace: "account" }),
    getTranslations({ locale, namespace: "auth" }),
    getTranslations({ locale, namespace: "booking" }),
    getFormatter({ locale }),
    getMyBookings(),
    getActiveAnnouncements(locale),
    getSiteSettings(locale),
    listResources("workspace", locale),
    listResources("room", locale),
  ]);
  const now = Date.now();
  const cutoff = settings.cancellation_cutoff_hours * 3600_000;
  const upcoming = bookings.filter((b) => ["confirmed", "pending"].includes(b.status) && new Date(b.end).getTime() > now);
  const past = bookings.filter((b) => b.status !== "cancelled" && new Date(b.end).getTime() <= now).reverse();
  const next = upcoming[0];
  const usedSlugs = new Set(bookings.map((b) => b.resourceSlug));
  const suggested = [...workspaces.filter((r) => r.featured), ...rooms.filter((r) => r.featured), ...workspaces, ...rooms]
    .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
    .sort((a, b) => Number(usedSlugs.has(b.slug)) - Number(usedSlugs.has(a.slug)))
    .slice(0, 3);
  const nextHref = next ? localizeHref(`${next.type === "workspace" ? "/coworking" : "/meeting-rooms"}/${next.resourceSlug}`, locale) : "";

  return (
    <div className="space-y-10">
      {welcome ? <FormAlert kind="success">{ta("welcomeVerified")}</FormAlert> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl" data-testid="account-welcome">{t("welcome", { name: profile.first_name || profile.email })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("memberSince", { date: f.dateTime(new Date(profile.created_at), "long") })} · {t("upcomingCount", { count: upcoming.length })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild><a href={localizeHref("/coworking", locale)}><CalendarPlus /> {t("bookWorkspace")}</a></Button>
          <Button asChild variant="outline"><a href={localizeHref("/meeting-rooms", locale)}><Building2 /> {t("bookRoom")}</a></Button>
        </div>
      </div>

      {next ? (
        <section className="overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-md" data-testid="next-booking">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="min-w-0 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/70">{t("nextUp")}</p>
              <h2 className="text-2xl font-bold tracking-tight">
                <a href={nextHref} className="hover:underline">{next.resourceName}</a>
              </h2>
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-primary-foreground/85">
                <li className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {f.dateTime(new Date(next.start), "weekday")}</li>
                <li className="flex items-center gap-1.5 tabular-nums"><Clock className="h-4 w-4" /> {tb("timeRange", { start: f.dateTime(new Date(next.start), "time"), end: f.dateTime(new Date(next.end), "time") })}</li>
                <li className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {[settings.address_line_1, settings.city].filter(Boolean).join(", ")}</li>
              </ul>
              <p className="text-xs text-primary-foreground/70">{t("reference")}: <span className="font-mono">{next.reference}</span></p>
            </div>
            {new Date(next.start).getTime() - cutoff > now ? (
              <div className="shrink-0 [&_button]:border-white/30 [&_button]:bg-white/10 [&_button]:text-white [&_button:hover]:bg-white/20">
                <CancelBookingButton bookingId={next.id} reference={next.reference} size="sm" />
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<CalendarDays />}
          title={t("noUpcoming")}
          description={t("noUpcomingHint")}
          action={<Button asChild><a href={localizeHref("/coworking", locale)}><CalendarPlus /> {t("bookWorkspace")}</a></Button>}
        />
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          {upcoming.length > 1 ? (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-tight">{t("nextBookings")}</h2>
                <a className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={localizeHref("/account/bookings", locale)}>{t("viewAll")} <ArrowRight className="h-3.5 w-3.5" /></a>
              </div>
              <ul className="space-y-3">
                {upcoming.slice(1, 5).map((b) => (
                  <BookingRow key={b.id} booking={b} locale={locale} cancellable={new Date(b.start).getTime() - cutoff > now} />
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">{t("pastBookings")}</h2>
              {past.length ? <a className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={localizeHref("/account/bookings", locale)}>{t("viewAll")} <ArrowRight className="h-3.5 w-3.5" /></a> : null}
            </div>
            {past.length ? (
              <ul className="space-y-3">
                {past.slice(0, 3).map((b) => (
                  <BookingRow key={b.id} booking={b} locale={locale} cancellable={false} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed bg-surface p-6 text-sm text-muted-foreground">{t("noPastShort")}</p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /> {t("yourProfile")}</CardTitle>
              <a href={localizeHref("/account/profile", locale)} className="text-sm font-medium text-primary hover:underline">{t("editProfile")}</a>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5 text-sm">
                <div className="font-semibold">{profile.full_name}</div>
                {profile.company ? <div className="text-muted-foreground">{profile.company}</div> : null}
                <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> <span className="truncate">{profile.email}</span></div>
                {profile.phone ? <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {profile.phone}</div> : null}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /> {t("announcements")}</CardTitle>
            </CardHeader>
            <CardContent>
              {news.length ? (
                <ul className="space-y-4" data-testid="announcements">
                  {news.map((n) => (
                    <li key={n.id} className="rounded-xl bg-surface p-3.5">
                      <p className="font-semibold">{n.title}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.content}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{f.dateTime(new Date(n.publishAt), "short")}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noAnnouncements")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {suggested.length ? (
        <section>
          <h2 className="mb-4 text-lg font-bold tracking-tight">{t("suggested")}</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {suggested.map((r) => (
              <ResourceCard key={r.id} resource={r} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
