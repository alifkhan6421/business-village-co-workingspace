import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/booking/token";
import { getSiteSettings } from "@/lib/cms";
import { localizeHref } from "@/lib/href";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { CancelBookingButton } from "@/components/booking/cancel-button";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ new?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "booking" });
  return { title: t("manageTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

const statusVariant = { confirmed: "success", pending: "warning", cancelled: "danger", completed: "muted", no_show: "muted" } as const;

/** Guest self-service page: the token is the only key, it is looked up by its hash. */
export default async function ManageBookingPage({ params, searchParams }: Props) {
  const { token } = await params;
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const { new: isNew } = await searchParams;
  const t = await getTranslations({ locale, namespace: "booking" });
  const ts = await getTranslations({ locale, namespace: "status" });
  const format = await getFormatter({ locale });

  const valid = /^[A-Za-z0-9_-]{20,100}$/.test(token);
  const admin = createAdminClient();
  const { data: b } = valid
    ? await admin
        .from("bookings")
        .select("id, booking_reference, status, start_at, end_at, attendees, booking_type, workspaces(name, slug, floor), rooms(name, slug, floor), guests(first_name, last_name, email)")
        .eq("management_token_hash", hashToken(token))
        .maybeSingle()
    : { data: null };

  if (!b) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <ErrorState title={t("invalidLink")} />
      </div>
    );
  }

  const settings = await getSiteSettings(locale);
  const res = (b.workspaces ?? b.rooms) as { name: string; slug: string; floor: string } | null;
  const cutoffMs = settings.cancellation_cutoff_hours * 3600_000;
  const cancellable = ["pending", "confirmed"].includes(b.status) && new Date(b.start_at).getTime() - cutoffMs > Date.now();
  const start = new Date(b.start_at);
  const end = new Date(b.end_at);

  const guest = b.guests as { first_name: string; last_name: string; email: string } | null;
  const confirmedNow = !!isNew && b.status === "confirmed";
  const rows: [string, React.ReactNode, string?][] = [
    [t("reference"), <span key="ref" className="font-mono text-base font-bold tracking-tight">{b.booking_reference}</span>, "booking-reference"],
    [t("status"), <Badge key="st" variant={statusVariant[b.status as keyof typeof statusVariant]}>{ts(`booking.${b.status}`)}</Badge>, "booking-status"],
    [t("resource"), <>{res?.name} <span className="text-muted-foreground">· {ts(`bookingType.${b.booking_type}`)}</span></>],
    [t("date"), format.dateTime(start, "weekday")],
    [t("time"), t("timeRange", { start: format.dateTime(start, "time"), end: format.dateTime(end, "time") })],
    [t("attendees"), String(b.attendees)],
    ...(guest ? ([[t("customer"), `${guest.first_name} ${guest.last_name}`], [t("email"), guest.email]] as [string, string][]) : []),
    [t("location"), [settings.company_name, res?.floor, settings.address_line_1, settings.city].filter(Boolean).join(", ")],
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      {confirmedNow ? (
        <div className="mb-8 text-center" data-testid="booking-success">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("confirmedTitle")}</h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t("newBookingText")}</p>
        </div>
      ) : (
        <h1 className="mb-6 text-3xl font-extrabold tracking-tight">{t("manageTitle")}</h1>
      )}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-md">
        <dl className="divide-y">
          {rows.map(([label, value, testId]) => (
            <div key={label} className="grid grid-cols-[8.5rem_1fr] items-center gap-4 px-5 py-3.5 text-sm sm:grid-cols-[11rem_1fr] sm:px-6">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words font-medium" data-testid={testId}>{value}</dd>
            </div>
          ))}
        </dl>
        {cancellable || ["pending", "confirmed"].includes(b.status) ? (
          <div className="flex flex-wrap items-center gap-3 border-t bg-surface px-5 py-4 sm:px-6">
            {cancellable ? (
              <>
                <CancelBookingButton token={token} reference={b.booking_reference} />
                <p className="text-xs text-muted-foreground">{t("cancelDeadline", { hours: settings.cancellation_cutoff_hours })}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("cannotCancel")}</p>
            )}
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">{t("rescheduleSoon")} {t("manageBookmark")}</p>
      <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
        <Button asChild size="lg">
          <a href={localizeHref("/coworking", locale)}>{t("bookAnother")}</a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href={`/${locale}`}>{t("backToHome")}</a>
        </Button>
      </div>
    </div>
  );
}
