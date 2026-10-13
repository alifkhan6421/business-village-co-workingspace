import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  PriceAdjustDialog,
  RequestDetailsForm,
  RequestMessageForm,
  RequestNoteForm,
  RequestStatusActions,
  type RoomAvailability,
} from "@/components/admin/request-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { loadCalendarSettings } from "@/lib/admin/queries";
import { loadPricingConfig } from "@/lib/pricing/load";
import { centsToDecimal, formatCents, optionName, toCents, type EstimateSnapshot } from "@/lib/pricing/calc";
import { formatBookingRange } from "@/lib/format-range";
import { berlinDate, berlinTime } from "@/lib/time";
import { getSiteSettings } from "@/lib/cms";
import type { RequestStatus } from "@/lib/admin/booking-requests";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

const OPEN: RequestStatus[] = ["pending", "under_review", "alternative_proposed"];

export default async function RequestDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("booking_requests")
    .select(
      "*, assigned_room:rooms!booking_requests_assigned_room_id_fkey(id, name, capacity), preferred_room:rooms!booking_requests_preferred_room_id_fkey(id, name, capacity), booking:bookings!booking_requests_booking_id_fkey(id, booking_reference, status)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();

  const [t, ts, f, config, calendar, site, events, emails, availability] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "status.request" }),
    getFormatter({ locale }),
    loadPricingConfig({ client: supabase }),
    loadCalendarSettings(),
    getSiteSettings(locale),
    supabase.from("booking_request_events").select("*, actor:profiles(full_name, email)").eq("request_id", id).order("created_at", { ascending: false }),
    supabase.from("email_logs").select("id, email_type, recipient, subject, status, created_at").eq("related_booking_request_id", id).order("created_at", { ascending: false }),
    supabase.rpc("admin_room_availability", { p_start: r.start_at, p_end: r.end_at }),
  ]);

  const status = r.status as RequestStatus;
  const assigned = r.assigned_room as { id: string; name: string; capacity: number } | null;
  const preferred = r.preferred_room as { id: string; name: string; capacity: number } | null;
  const booking = r.booking as { id: string; booking_reference: string; status: string } | null;
  const rooms: RoomAvailability[] = (availability.data ?? []).map((a) => ({
    id: a.room_id,
    name: a.name,
    capacity: a.capacity,
    status: a.status,
    conflict: a.conflict as RoomAvailability["conflict"],
    conflictReference: a.conflict_reference,
  }));
  // The request's own confirmed booking is not a conflict for itself.
  if (booking) for (const room of rooms) if (room.conflictReference === r.reference) room.conflict = "free";
  const snapshot = r.price_snapshot as EstimateSnapshot | null;
  const quote = r.quote_snapshot as EstimateSnapshot | null;
  const fmtMoney = (v: number | string | null) => (v === null || v === undefined ? "—" : formatCents(toCents(v), locale));
  const settings = { ...calendar, maxHours: site.booking_max_hours };
  const base = `/${locale}/admin/requests`;

  return (
    <>
      <AdminPageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{r.reference}</span>
            <StatusBadge kind="request" value={status} />
          </span>
        }
        subtitle={t("requests.receivedAt", { date: f.dateTime(new Date(r.created_at), "dateTime") })}
        back={{ href: base, label: t("nav.requests") }}
        actions={
          booking ? (
            <Link href={`/${locale}/admin/bookings/${booking.id}`} className={buttonVariants({ variant: "outline" })} data-testid="linked-booking">
              <ExternalLink /> {t("requests.openBooking", { reference: booking.booking_reference })}
            </Link>
          ) : null
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("requests.workflow")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <RequestStatusActions
                requestId={r.id}
                status={status}
                roomName={assigned?.name ?? null}
                alt={{
                  date: berlinDate(r.alternative_start_at ?? r.start_at),
                  start: berlinTime(r.alternative_start_at ?? r.start_at),
                  hours: r.duration_hours,
                }}
                settings={settings}
              />
              {OPEN.includes(status) && !assigned ? <p className="text-xs text-muted-foreground">{t("requests.assignBeforeConfirm")}</p> : null}
              {r.alternative_start_at && r.alternative_end_at ? (
                <p className="rounded-lg bg-muted p-3 text-sm">
                  {t("requests.alternativeProposed", { when: formatBookingRange(f, r.alternative_start_at, r.alternative_end_at) })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("requests.details")}</CardTitle></CardHeader>
            <CardContent>
              <RequestDetailsForm
                request={{
                  id: r.id,
                  date: berlinDate(r.start_at),
                  start: berlinTime(r.start_at),
                  hours: r.duration_hours,
                  participants: r.participants,
                  roomId: assigned?.id ?? null,
                  option: quote?.option?.key ?? snapshot?.option?.key ?? null,
                }}
                rooms={rooms}
                config={config}
                settings={settings}
                editable={OPEN.includes(status)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">{t("requests.price")}</CardTitle>
              {OPEN.includes(status) ? (
                <PriceAdjustDialog
                  requestId={r.id}
                  current={centsToDecimal(toCents((config.settings.pricesIncludeVat ? r.quote_gross : r.quote_net) ?? 0)).replace(".", locale === "de" ? "," : ".")}
                  pricesIncludeVat={config.settings.pricesIncludeVat}
                />
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border p-4" data-testid="original-estimate">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("requests.originalEstimate")}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(r.estimated_gross)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("requests.netVat", { net: fmtMoney(r.estimated_net), vat: fmtMoney(r.estimated_vat) })}
                  </p>
                  {snapshot?.option ? <p className="mt-2 text-xs">{optionName(snapshot.option, locale)}</p> : <p className="mt-2 text-xs text-muted-foreground">{t("requests.noEstimate")}</p>}
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="current-quote">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("requests.currentQuote")}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums" data-testid="quote-gross">{fmtMoney(r.quote_gross)}</p>
                  <p className="text-xs text-muted-foreground">{t("requests.netVat", { net: fmtMoney(r.quote_net), vat: fmtMoney(r.quote_vat) })}</p>
                  {r.price_adjusted ? (
                    <p className="mt-2 text-xs"><Badge variant="warning">{t("requests.adjusted")}</Badge> {r.price_adjustment_reason}</p>
                  ) : quote?.option ? (
                    <p className="mt-2 text-xs">{optionName(quote.option, locale)}</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("requests.history")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <RequestNoteForm requestId={r.id} />
              <ol className="space-y-3 border-l pl-4" data-testid="request-history">
                {(events.data ?? []).map((e) => {
                  const actor = e.actor as { full_name: string | null; email: string } | null;
                  return (
                    <li key={e.id} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary/60" aria-hidden="true" />
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{f.dateTime(new Date(e.created_at), "dateTime")}</span>
                        <span aria-hidden="true">·</span>
                        <span>{actor ? actor.full_name || actor.email : t("requests.customerOrSystem")}</span>
                      </div>
                      <div className="font-medium">
                        {e.event_type === "status" && e.to_status
                          ? t("requests.event.status", { from: e.from_status ? ts(e.from_status) : "—", to: ts(e.to_status) })
                          : t(`requests.event.${e.event_type}`)}
                      </div>
                      {e.note ? <p className="whitespace-pre-wrap break-words text-foreground/80">{e.note}</p> : null}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("requests.customer")}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="grid grid-cols-[7.5rem_1fr] gap-y-1.5">
                <dt className="text-muted-foreground">{t("common.name")}</dt><dd className="break-words font-medium">{r.contact_name}</dd>
                <dt className="text-muted-foreground">{t("common.email")}</dt>
                <dd className="break-all"><a href={`mailto:${r.contact_email}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Mail className="h-3.5 w-3.5" />{r.contact_email}</a></dd>
                <dt className="text-muted-foreground">{t("common.phone")}</dt>
                <dd>{r.contact_phone ? <a href={`tel:${r.contact_phone}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{r.contact_phone}</a> : "—"}</dd>
                <dt className="text-muted-foreground">{t("common.company")}</dt><dd>{r.contact_company || "—"}</dd>
                <dt className="text-muted-foreground">{t("users.language")}</dt><dd>{r.locale.toUpperCase()}</dd>
                <dt className="text-muted-foreground">{t("requests.account")}</dt><dd>{r.user_id ? t("bookings.member") : t("bookings.guest")}</dd>
                <dt className="text-muted-foreground">{t("bookings.when")}</dt><dd>{formatBookingRange(f, r.start_at, r.end_at)}</dd>
                <dt className="text-muted-foreground">{t("requests.participants")}</dt><dd>{r.participants}</dd>
                <dt className="text-muted-foreground">{t("requests.preferredRoom")}</dt><dd>{preferred?.name ?? "—"}</dd>
              </dl>
              {r.message ? <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3">{r.message}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("requests.roomAvailability")}</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">{t("requests.availabilityFor", { when: formatBookingRange(f, r.start_at, r.end_at) })}</p>
              <ul className="divide-y rounded-xl border text-sm" data-testid="room-availability">
                {rooms.map((room) => {
                  const tooSmall = r.participants > room.capacity;
                  return (
                    <li key={room.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{room.name}{assigned?.id === room.id ? <span className="ml-1 text-xs text-primary">({t("requests.assigned")})</span> : null}</div>
                        <div className={tooSmall ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{t("requests.upTo", { count: room.capacity })}</div>
                      </div>
                      <Badge variant={room.conflict === "free" ? (tooSmall ? "warning" : "success") : "danger"}>
                        {t(`requests.availability.${room.conflict}`)}
                        {room.conflictReference && room.conflict !== "free" ? ` · ${room.conflictReference}` : ""}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("requests.messageCustomer")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <RequestMessageForm requestId={r.id} />
              {(emails.data ?? []).length ? (
                <ul className="space-y-2 text-xs" data-testid="request-emails">
                  {(emails.data ?? []).map((m) => (
                    <li key={m.id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.subject}</div>
                        <div className="truncate text-muted-foreground">{m.recipient} · {f.dateTime(new Date(m.created_at), "dateTime")}</div>
                      </div>
                      <StatusBadge kind="email" value={m.status} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
