import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  AdjustPriceForm,
  RecalculateButton,
  RequestDetailsForm,
  RequestMessageForm,
  RequestNoteForm,
  RequestStatusActions,
  type SpaceOption,
} from "@/components/admin/request-forms";
import { QuoteBreakdown } from "@/components/pricing/estimate-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadCalendarSettings } from "@/lib/admin/queries";
import { formatBookingRange } from "@/lib/format-range";
import { berlinDate, berlinTime } from "@/lib/time";
import { formatCents, toCents, type Quote } from "@/lib/pricing/calc";
import { loadPricingConfig } from "@/lib/pricing/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/routing";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

type Snapshot = Partial<Quote> & { manual?: boolean; reason?: string; grossCents?: number; netCents?: number; vatCents?: number };

function isQuote(s: Snapshot | null): s is Quote {
  return !!s && Array.isArray(s.lines) && typeof s.grossCents === "number";
}

function slotTimes(dayStart: string, dayEnd: string, step: number) {
  const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const out: string[] = [];
  for (let m = toMin(dayStart); m < toMin(dayEnd); m += Math.max(15, step)) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

const EMAIL_STATUS: Record<string, string> = { confirmed: "confirmed", rejected: "rejected", alternative: "alternative_proposed", cancelled: "cancelled" };

export default async function RequestDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("booking_requests")
    .select("*, room:rooms!booking_requests_assigned_room_id_fkey(name), workspace:workspaces(name), source_room:rooms!booking_requests_source_room_id_fkey(name), package:pricing_packages(name_de, name_en), booking:bookings!booking_requests_booking_id_fkey(booking_reference, status)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const r = data as unknown as Tables<"booking_requests"> & {
    room: { name: string } | null;
    workspace: { name: string } | null;
    source_room: { name: string } | null;
    package: { name_de: string; name_en: string } | null;
    booking: { booking_reference: string; status: string } | null;
  };

  let bookingQuery = supabase
    .from("bookings")
    .select("id, booking_reference, room_id, workspace_id, start_at, end_at, status, attendees, room:rooms(name), workspace:workspaces(name)")
    .in("status", ["pending", "confirmed"])
    .lt("start_at", r.end_at)
    .gt("end_at", r.start_at)
    .order("start_at");
  if (r.booking_id) bookingQuery = bookingQuery.neq("id", r.booking_id);

  const [t, ts, f, settings, pricing, rooms, workspaces, overlaps, blocks, events, emails] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "status" }),
    getFormatter({ locale }),
    loadCalendarSettings(),
    loadPricingConfig(),
    supabase.from("rooms").select("id, name, capacity, status").order("display_order").order("name"),
    supabase.from("workspaces").select("id, name, capacity, status").order("display_order").order("name"),
    bookingQuery,
    supabase.from("resource_blocks").select("room_id, workspace_id").lt("start_at", r.end_at).gt("end_at", r.start_at),
    supabase.from("booking_request_events").select("id, event_type, from_status, to_status, note, actor_label, created_at, actor:profiles(full_name, email)").eq("request_id", id).order("created_at", { ascending: false }),
    supabase.from("email_logs").select("id, email_type, subject, recipient, status, error_message, created_at").eq("related_booking_request_id", id).order("created_at", { ascending: false }),
  ]);

  type Overlap = { id: string; booking_reference: string; room_id: string | null; workspace_id: string | null; start_at: string; end_at: string; status: string; attendees: number; room: { name: string } | null; workspace: { name: string } | null };
  const busy = (overlaps.data ?? []) as unknown as Overlap[];
  const busyIds = new Set(busy.map((b) => b.room_id ?? b.workspace_id));
  const blockedIds = new Set((blocks.data ?? []).map((b) => b.room_id ?? b.workspace_id));
  const state = (x: { id: string; capacity: number; status: string }): SpaceOption["state"] =>
    x.status !== "available" ? "unavailable" : blockedIds.has(x.id) ? "blocked" : busyIds.has(x.id) ? "busy" : x.capacity < r.participants ? "small" : "free";
  const spaces: SpaceOption[] = [
    ...(rooms.data ?? []).map((x) => ({ value: `room:${x.id}`, label: `${x.name} (${x.capacity})`, group: "room" as const, state: state(x) })),
    ...(workspaces.data ?? []).map((x) => ({ value: `workspace:${x.id}`, label: x.name, group: "workspace" as const, state: state(x) })),
  ];

  const hours = Math.round((new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 3600000);
  const requestedHours = Math.round((new Date(r.requested_end).getTime() - new Date(r.requested_start).getTime()) / 3600000);
  const resource = r.assigned_room_id ? `room:${r.assigned_room_id}` : r.assigned_workspace_id ? `workspace:${r.assigned_workspace_id}` : "";
  const spaceName = r.room?.name ?? r.workspace?.name ?? null;
  const estimate = r.estimate_snapshot as Snapshot | null;
  const current = r.price_snapshot as Snapshot | null;
  const money = (v: number | null) => {
    const c = toCents(v);
    return c === null ? "—" : formatCents(c, locale);
  };
  const changed = r.start_at !== r.requested_start || r.end_at !== r.requested_end || r.participants !== r.requested_participants;
  const base = `/${locale}/admin`;
  const alt = r.alternative_start ? new Date(r.alternative_start) : new Date(r.start_at);

  return (
    <>
      <AdminPageHeader
        title={t("requests.detailTitle", { reference: r.reference })}
        subtitle={`${r.full_name} · ${formatBookingRange(f, r.start_at, r.end_at)}`}
        back={{ href: `${base}/requests`, label: t("nav.requests") }}
        actions={<StatusBadge kind="request" value={r.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("requests.requestSection")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label={t("requests.reference")}><span className="font-mono">{r.reference}</span></Row>
                <Row label={t("common.status")}><StatusBadge kind="request" value={r.status} /></Row>
                <Row label={t("requests.spaceType")}>{r.space_type === "workspace" ? t("requests.deskRequest") : t("requests.roomRequest")}</Row>
                <Row label={t("requests.requestedTime")}>
                  {formatBookingRange(f, r.requested_start, r.requested_end)}
                  <span className="text-muted-foreground"> · {t("requests.hoursShort", { count: requestedHours })}</span>
                </Row>
                <Row label={t("requests.people")}>{r.requested_participants}</Row>
                {changed ? (
                  <Row label={t("requests.currentTime")}>
                    {formatBookingRange(f, r.start_at, r.end_at)} · {t("requests.peopleCount", { count: r.participants })}
                  </Row>
                ) : null}
                {r.source_room ? <Row label={t("requests.fromRoom")}>{r.source_room.name}</Row> : null}
                {r.package ? <Row label={t("requests.package")}>{locale === "de" ? r.package.name_de : r.package.name_en}</Row> : null}
                <Row label={t("requests.assignedSpace")}>{spaceName ?? <span className="text-muted-foreground">{t("requests.unassigned")}</span>}</Row>
                {r.alternative_start && r.alternative_end ? <Row label={t("requests.alternative")}>{formatBookingRange(f, r.alternative_start, r.alternative_end)}</Row> : null}
                {r.status_reason ? <Row label={t("requests.statusReason")}>{r.status_reason}</Row> : null}
                {r.booking_id && r.booking ? (
                  <Row label={t("requests.booking")}>
                    <Link href={`${base}/bookings/${r.booking_id}`} className="inline-flex items-center gap-1 font-mono text-primary hover:underline">
                      {r.booking.booking_reference} <ExternalLink className="h-3.5 w-3.5" />
                    </Link>{" "}
                    <StatusBadge kind="booking" value={r.booking.status} />
                  </Row>
                ) : null}
                <Row label={t("bookings.locale")}>{r.locale.toUpperCase()}</Row>
                <Row label={t("requests.received")}>{f.dateTime(new Date(r.created_at), "dateTime")}</Row>
              </dl>
              {r.message ? (
                <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{t("requests.customerMessage")}</div>
                  <p className="whitespace-pre-wrap break-words">{r.message}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("bookings.customerSection")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label={t("common.name")}>
                  {r.full_name} <Badge variant={r.user_id ? "secondary" : "outline"}>{r.user_id ? t("bookings.member") : t("bookings.guest")}</Badge>
                </Row>
                <Row label={t("common.email")}><a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a></Row>
                <Row label={t("common.phone")}>{r.phone ? <a href={`tel:${r.phone}`} className="text-primary hover:underline">{r.phone}</a> : "—"}</Row>
                <Row label={t("common.company")}>{r.company || "—"}</Row>
              </dl>
              {r.user_id ? (
                <Link href={`${base}/users/${r.user_id}`} className="mt-2 inline-block text-sm text-primary hover:underline">{t("bookings.viewProfile")} →</Link>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("requests.priceSection")}</CardTitle>
              <CardDescription>{t("requests.priceHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div data-testid="current-price">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t("requests.currentPrice")}</h3>
                  {r.price_adjusted ? <Badge variant="secondary">{t("requests.manualBadge")}</Badge> : null}
                </div>
                {isQuote(current) ? (
                  <QuoteBreakdown quote={current} config={pricing} locale={locale} />
                ) : r.price_gross !== null ? (
                  <dl>
                    <Row label={t("requests.net")}>{money(r.price_net)}</Row>
                    <Row label={t("requests.vat")}>{money(r.price_vat)}</Row>
                    <Row label={t("requests.gross")}><strong className="text-base">{money(r.price_gross)}</strong></Row>
                    {r.price_adjustment_reason ? <Row label={t("requests.adjustReason")}>{r.price_adjustment_reason}</Row> : null}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("requests.noPrice")}</p>
                )}
                <div className="mt-3">
                  <RecalculateButton id={r.id} />
                </div>
              </div>
              <AdjustPriceForm id={r.id} current={money(r.price_gross)} />
              <details className="rounded-md border p-3" data-testid="estimate-snapshot">
                <summary className="cursor-pointer text-sm font-medium">
                  {t("requests.originalEstimate")} · {money(r.estimate_gross)}
                </summary>
                <div className="mt-3">
                  {isQuote(estimate) ? <QuoteBreakdown quote={estimate} config={pricing} locale={locale} /> : <p className="text-sm text-muted-foreground">{t("requests.noPrice")}</p>}
                </div>
              </details>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("requests.workflow")}</CardTitle>
              <CardDescription>{t("requests.workflowHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestStatusActions
                r={{
                  id: r.id,
                  status: r.status,
                  hasSpace: !!resource,
                  reopen: true,
                  altDate: berlinDate(alt),
                  altStart: berlinTime(alt),
                  altHours: hours,
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("requests.scheduleSection")}</CardTitle>
              <CardDescription>{t("requests.scheduleHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <RequestDetailsForm
                key={`${r.start_at}-${r.end_at}-${r.participants}-${resource}`}
                r={{ id: r.id, resource, date: berlinDate(r.start_at), start: berlinTime(r.start_at), hours, participants: r.participants, priceAdjusted: r.price_adjusted }}
                spaces={spaces}
                times={slotTimes(settings.dayStart, settings.dayEnd, settings.slotMinutes)}
              />
              <div data-testid="overlapping-bookings">
                <h3 className="mb-2 text-sm font-semibold">{t("requests.existingReservations")}</h3>
                {busy.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("requests.noOverlaps")}</p>
                ) : (
                  <ul className="divide-y rounded-md border text-sm">
                    {busy.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="font-medium">{b.room?.name ?? b.workspace?.name}</span>
                        <span className="text-muted-foreground">{formatBookingRange(f, b.start_at, b.end_at)}</span>
                        <Link href={`${base}/bookings/${b.id}`} className="font-mono text-xs text-primary hover:underline">{b.booking_reference}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("requests.messageSection")}</CardTitle>
              <CardDescription>{t("requests.messageHint", { email: r.email })}</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestMessageForm id={r.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("requests.history")}</CardTitle>
              <CardDescription>{t("requests.historyHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RequestNoteForm id={r.id} />
              <ol className="space-y-3" data-testid="request-history">
                {(events.data ?? []).map((e) => {
                  const a = e.actor as unknown as { full_name: string | null; email: string } | null;
                  const who = a?.full_name || a?.email || e.actor_label || t("requests.system");
                  const emailKind = e.event_type === "message_sent" && e.note?.startsWith("email:") ? e.note.slice(6) : null;
                  return (
                    <li key={e.id} className={e.event_type === "note" ? "rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/30" : "border-l-2 pl-3 text-sm"}>
                      <div className="font-medium">
                        {t(`requests.events.${e.event_type}`)}
                        {e.event_type === "status_changed" && e.to_status ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {e.from_status ? `${ts(`request.${e.from_status}`)} → ` : ""}
                            {ts(`request.${e.to_status}`)}
                          </span>
                        ) : null}
                        {emailKind ? <span className="font-normal text-muted-foreground"> · {ts(`request.${EMAIL_STATUS[emailKind] ?? "pending"}`)}</span> : null}
                      </div>
                      {e.note && !emailKind ? <p className="mt-0.5 whitespace-pre-wrap break-words">{e.note}</p> : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {who} · {f.dateTime(new Date(e.created_at), "dateTime")}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("requests.emails")}</CardTitle>
            </CardHeader>
            <CardContent>
              {(emails.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("requests.noEmails")}</p>
              ) : (
                <ul className="divide-y text-sm" data-testid="request-emails">
                  {(emails.data ?? []).map((m) => (
                    <li key={m.id} className="py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{m.subject}</span>
                        <StatusBadge kind="email" value={m.status} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {m.recipient} · {f.dateTime(new Date(m.created_at), "dateTime")}
                        {m.error_message ? ` · ${m.error_message}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
