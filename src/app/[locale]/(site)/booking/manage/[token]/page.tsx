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

type Props = { params: Promise<{ locale: Locale; token: string }>; searchParams: Promise<{ new?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "booking" });
  return { title: t("manageTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

const statusVariant = { confirmed: "success", pending: "warning", cancelled: "danger", completed: "muted", no_show: "muted" } as const;

/** Guest self-service page: the token is the only key, it is looked up by its hash. */
export default async function ManageBookingPage({ params, searchParams }: Props) {
  const { locale, token } = await params;
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
        .select("id, booking_reference, status, start_at, end_at, attendees, booking_type, workspaces(name, slug, floor), rooms(name, slug, floor)")
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {isNew && b.status === "confirmed" ? (
        <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950" data-testid="booking-success">
          <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" />
          <h1 className="text-2xl font-semibold">{t("newBookingTitle")}</h1>
          <p className="mt-2 text-sm">{t("newBookingText")}</p>
        </div>
      ) : (
        <h1 className="mb-6 text-2xl font-semibold">{t("manageTitle")}</h1>
      )}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">{t("reference")}</dt>
            <dd className="font-mono text-lg font-semibold" data-testid="booking-reference">{b.booking_reference}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("status")}</dt>
            <dd><Badge variant={statusVariant[b.status as keyof typeof statusVariant]} data-testid="booking-status">{ts(`booking.${b.status}`)}</Badge></dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("resource")}</dt>
            <dd className="font-medium">{res?.name} <span className="text-sm text-muted-foreground">({ts(`bookingType.${b.booking_type}`)})</span></dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("date")}</dt>
            <dd className="font-medium">{format.dateTime(start, "weekday")}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("time")}</dt>
            <dd className="font-medium">{t("timeRange", { start: format.dateTime(start, "time"), end: format.dateTime(end, "time") })}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("location")}</dt>
            <dd className="font-medium">{[settings.company_name, res?.floor, settings.address_line_1, settings.city].filter(Boolean).join(", ")}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-6">
          {cancellable ? (
            <>
              <CancelBookingButton token={token} reference={b.booking_reference} />
              <p className="text-xs text-muted-foreground">{t("cancelDeadline", { hours: settings.cancellation_cutoff_hours })}</p>
            </>
          ) : ["pending", "confirmed"].includes(b.status) ? (
            <p className="text-sm text-muted-foreground">{t("cannotCancel")}</p>
          ) : null}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t("rescheduleSoon")} {t("manageBookmark")}</p>
      </div>
      <div className="mt-6">
        <Button asChild variant="ghost">
          <a href={localizeHref("/", locale)}>{t("bookAnother")}</a>
        </Button>
      </div>
    </div>
  );
}
