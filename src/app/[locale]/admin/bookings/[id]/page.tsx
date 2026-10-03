import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import { BookingEditForm, CancelBookingDialog, MessageForm, NoteForm } from "@/components/admin/booking-detail-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BOOKING_SELECT, customerOf, loadCalendarSettings, loadResourceOptions, resourceName, type AdminBooking } from "@/lib/admin/queries";
import { formatBookingRange } from "@/lib/format-range";
import { berlinDate, berlinTime } from "@/lib/time";
import type { Locale } from "@/i18n/routing";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function BookingDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const b = data as unknown as AdminBooking;
  const [t, ts, f, resources, settings, notes, messages, emails, creator] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "status" }),
    getFormatter({ locale }),
    loadResourceOptions(),
    loadCalendarSettings(),
    supabase.from("booking_notes").select("id, note, created_at, author:profiles(full_name, email)").eq("booking_id", id).order("created_at", { ascending: false }),
    supabase.from("booking_messages").select("*").eq("booking_id", id).order("created_at", { ascending: true }),
    supabase.from("email_logs").select("id, email_type, subject, recipient, status, created_at").eq("related_booking_id", id).order("created_at", { ascending: false }),
    b.created_by ? supabase.from("profiles").select("full_name, email").eq("id", b.created_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const c = customerOf(b);
  const base = `/${locale}/admin`;
  const active = ["pending", "confirmed"].includes(b.status);

  return (
    <>
      <AdminPageHeader
        title={t("bookings.detailTitle", { reference: b.booking_reference })}
        subtitle={`${resourceName(b)} · ${formatBookingRange(f, b.start_at, b.end_at)}`}
        back={{ href: `${base}/bookings`, label: t("nav.bookings") }}
        actions={active ? <CancelBookingDialog bookingId={b.id} /> : null}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("bookings.bookingSection")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label={t("bookings.reference")}><span className="font-mono">{b.booking_reference}</span></Row>
                <Row label={t("common.status")}><StatusBadge kind="booking" value={b.status} /></Row>
                <Row label={t("common.resource")}>{resourceName(b)} ({ts(`bookingType.${b.booking_type}`)})</Row>
                <Row label={t("bookings.when")}>{formatBookingRange(f, b.start_at, b.end_at)}</Row>
                <Row label={t("bookings.attendees")}>{b.attendees}</Row>
                <Row label={t("bookings.purpose")}>{b.purpose || "—"}</Row>
                <Row label={t("bookings.source")}>{ts(`source.${b.source}`)}</Row>
                <Row label={t("bookings.locale")}>{b.locale.toUpperCase()}</Row>
                <Row label={t("common.createdAt")}>{f.dateTime(new Date(b.created_at), "dateTime")}</Row>
                {creator.data ? <Row label={t("bookings.createdBy")}>{creator.data.full_name || creator.data.email}</Row> : null}
                {b.cancelled_at ? <Row label={t("bookings.cancelledAt")}>{f.dateTime(new Date(b.cancelled_at), "dateTime")}{b.cancellation_reason ? ` · ${b.cancellation_reason}` : ""}</Row> : null}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("bookings.customerSection")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label={t("common.name")}>
                  {c.name} <Badge variant={c.kind === "member" ? "secondary" : "outline"}>{c.kind === "member" ? t("bookings.member") : t("bookings.guest")}</Badge>
                </Row>
                <Row label={t("common.email")}><a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a></Row>
                <Row label={t("common.phone")}>{c.phone || "—"}</Row>
                <Row label={t("common.company")}>{c.company || "—"}</Row>
              </dl>
              {c.id ? (
                <Link href={c.kind === "member" ? `${base}/users/${c.id}` : `${base}/guests/${c.id}`} className="mt-2 inline-block text-sm text-primary hover:underline">
                  {c.kind === "member" ? t("bookings.viewProfile") : t("bookings.viewGuest")} →
                </Link>
              ) : null}
              {c.kind === "guest" ? <p className="mt-3 text-xs text-muted-foreground">{t("bookings.guestLinkHint")}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("bookings.notes")}</CardTitle>
              <CardDescription>{t("bookings.notesHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <NoteForm bookingId={b.id} />
              {(notes.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("bookings.noNotes")}</p>
              ) : (
                <ul className="space-y-2">
                  {(notes.data ?? []).map((n) => {
                    const a = n.author as unknown as { full_name: string | null; email: string } | null;
                    return (
                      <li key={n.id} className="rounded-md bg-amber-50 p-3 text-sm">
                        <p className="whitespace-pre-wrap break-words">{n.note}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{a?.full_name || a?.email} · {f.dateTime(new Date(n.created_at), "dateTime")}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("bookings.editSchedule")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BookingEditForm
                booking={{
                  id: b.id,
                  type: b.booking_type as "workspace" | "room",
                  resourceId: (b.workspace_id ?? b.room_id)!,
                  date: berlinDate(b.start_at),
                  start: berlinTime(b.start_at),
                  end: berlinTime(b.end_at),
                  attendees: b.attendees,
                  purpose: b.purpose ?? "",
                  status: b.status,
                }}
                resources={resources}
                settings={settings}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("bookings.messages")}</CardTitle>
              <CardDescription>{t("bookings.messagesHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(messages.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("bookings.noMessages")}</p>
              ) : (
                <ul className="space-y-2" data-testid="booking-messages">
                  {(messages.data ?? []).map((m) => (
                    <li key={m.id} className={`rounded-lg p-3 text-sm ${m.direction === "outbound" ? "ml-6 bg-primary/10" : "mr-6 bg-muted"}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={m.direction === "outbound" ? "secondary" : "info"}>{ts(`direction.${m.direction}`)}</Badge>
                        {m.sender_name || m.sender_email} · {f.dateTime(new Date(m.created_at), "dateTime")}
                      </div>
                      <p className="whitespace-pre-wrap break-words">{m.message}</p>
                    </li>
                  ))}
                </ul>
              )}
              <MessageForm bookingId={b.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("bookings.emailsSent")}</CardTitle>
            </CardHeader>
            <CardContent>
              {(emails.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("bookings.noEmails")}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {(emails.data ?? []).map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                      <Link href={`${base}/email-logs/${e.id}`} className="min-w-0 flex-1 truncate hover:underline">{e.subject}</Link>
                      <span className="text-xs text-muted-foreground">{e.recipient}</span>
                      <StatusBadge kind="email" value={e.status} />
                      <span className="text-xs text-muted-foreground">{f.dateTime(new Date(e.created_at), "dateTime")}</span>
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
