import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { CancelBookingButton } from "@/components/booking/cancel-button";
import { localizeHref } from "@/lib/href";
import type { MyBooking } from "@/lib/account";
import type { Locale } from "@/i18n/routing";

const variant = { confirmed: "success", pending: "warning", cancelled: "danger", completed: "muted", no_show: "muted" } as const;

export async function BookingRow({ booking, locale, cancellable }: { booking: MyBooking; locale: Locale; cancellable: boolean }) {
  const t = await getTranslations({ locale, namespace: "account" });
  const tb = await getTranslations({ locale, namespace: "booking" });
  const ts = await getTranslations({ locale, namespace: "status" });
  const f = await getFormatter({ locale });
  const start = new Date(booking.start);
  const end = new Date(booking.end);
  const href = localizeHref(`${booking.type === "workspace" ? "/coworking" : "/meeting-rooms"}/${booking.resourceSlug}`, locale);
  const day = new Intl.DateTimeFormat(locale, { day: "2-digit", timeZone: "Europe/Berlin" }).format(start);
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "Europe/Berlin" }).format(start);
  return (
    <li className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between" data-testid="my-booking">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary text-secondary-foreground" aria-hidden="true">
          <span className="text-lg font-extrabold leading-none tabular-nums">{day}</span>
          <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide">{month}</span>
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <a href={href} className="font-semibold hover:text-primary">{booking.resourceName}</a>
            <Badge variant={variant[booking.status as keyof typeof variant]}>{ts(`booking.${booking.status}`)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {f.dateTime(start, "weekday")} · <span className="tabular-nums">{tb("timeRange", { start: f.dateTime(start, "time"), end: f.dateTime(end, "time") })}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {t("reference")}: <span className="font-mono">{booking.reference}</span>
          </p>
        </div>
      </div>
      {cancellable ? <CancelBookingButton bookingId={booking.id} reference={booking.reference} size="sm" /> : null}
    </li>
  );
}
