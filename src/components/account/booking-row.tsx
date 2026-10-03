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
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="my-booking">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <a href={href} className="font-semibold hover:text-primary">{booking.resourceName}</a>
          <Badge variant={variant[booking.status as keyof typeof variant]}>{ts(`booking.${booking.status}`)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {f.dateTime(start, "weekday")} · {tb("timeRange", { start: f.dateTime(start, "time"), end: f.dateTime(end, "time") })}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {t("reference")}: {booking.reference}
        </p>
      </div>
      {cancellable ? <CancelBookingButton bookingId={booking.id} reference={booking.reference} size="sm" /> : null}
    </li>
  );
}
