import "server-only";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/href";
import { formatCents, formatVatRate, toCents } from "@/lib/pricing/calc";
import { sendEmail } from "./send";
import { addressLine, companyInfo, esc, fill, formatRange, layout, loadTemplate, type Row, type TemplateKey } from "./templates";

export type RequestEmailKind = "received" | "confirmed" | "rejected" | "alternative" | "cancelled" | "message";

const KEYS: Record<RequestEmailKind, TemplateKey> = {
  received: "request_received",
  confirmed: "request_confirmed",
  rejected: "request_rejected",
  alternative: "request_alternative",
  cancelled: "request_cancelled",
  message: "request_message",
};

async function loadRequest(id: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("booking_requests").select("*, room:rooms!booking_requests_assigned_room_id_fkey(name, floor)").eq("id", id).single();
  return data;
}

type RequestRow = NonNullable<Awaited<ReturnType<typeof loadRequest>>>;

/** "€248 (incl. 19 % VAT)" from the stored price columns and snapshot. */
function priceText(r: RequestRow, which: "estimate" | "current", locale: Locale, t: Awaited<ReturnType<typeof getTranslations>>) {
  const snap = (which === "estimate" ? r.estimate_snapshot : r.price_snapshot) as { maxGrossCents?: number | null; vatBasisPoints?: number } | null;
  const gross = toCents(which === "estimate" ? r.estimate_gross : r.price_gross);
  if (gross === null) return t("priceOnRequest");
  const amount = snap?.maxGrossCents ? `${formatCents(gross, locale)} – ${formatCents(snap.maxGrossCents, locale)}` : formatCents(gross, locale);
  return `${amount} (${t("inclVat", { rate: formatVatRate(snap?.vatBasisPoints ?? 1900, locale) })})`;
}

function scheduleRows(start: string, end: string, hours: number, participants: number, locale: Locale, t: Awaited<ReturnType<typeof getTranslations>>): Row[] {
  const when = formatRange(start, end, locale);
  return [
    [t("date"), when.date],
    [t("startTime"), t("timeRange", { start: when.start, end: when.end })],
    [t("duration"), t("hours", { count: hours })],
    [t("attendees"), String(participants)],
  ];
}

const hoursBetween = (start: string, end: string) => Math.round((new Date(end).getTime() - new Date(start).getTime()) / 3600000);

/** Customer emails for the request workflow, in the language the request was sent in. */
export async function sendRequestEmail(requestId: string, kind: RequestEmailKind, opts: { message?: string } = {}) {
  const r = await loadRequest(requestId);
  if (!r) return;
  const locale = (r.locale === "en" ? "en" : "de") as Locale;
  const key = KEYS[kind];
  const tpl = await loadTemplate(key, locale);
  if (!tpl) return;
  const t = await getTranslations({ locale, namespace: "emails" });
  const ts = await getTranslations({ locale, namespace: "status.request" });
  const site = await companyInfo();
  const company = site?.company_name ?? "Business Village";
  const room = (r.room as { name: string; floor: string } | null) ?? null;
  const vars = { name: r.full_name, reference: r.reference, resource: room?.name ?? "" };

  let rows: Row[] = [[t("requestReference"), r.reference]];
  if (kind === "received") {
    rows = [
      ...rows,
      ...scheduleRows(r.requested_start, r.requested_end, r.requested_hours, r.requested_participants, locale, t),
      [t("estimatedPrice"), priceText(r, "estimate", locale, t)],
      [t("status"), ts("pending")],
    ];
  } else if (kind === "confirmed") {
    rows = [
      ...rows,
      [t("resource"), room?.name ?? ""],
      ...scheduleRows(r.start_at, r.end_at, hoursBetween(r.start_at, r.end_at), r.participants, locale, t),
      [t("location"), [company, room?.floor, addressLine(site)].filter(Boolean).join(", ")],
      [t("confirmedPrice"), priceText(r, "current", locale, t)],
    ];
  } else if (kind === "alternative" && r.alternative_start && r.alternative_end) {
    const alt = formatRange(r.alternative_start, r.alternative_end, locale);
    const req = formatRange(r.requested_start, r.requested_end, locale);
    rows = [
      ...rows,
      [t("requestedTime"), `${req.date}, ${t("timeRange", { start: req.start, end: req.end })}`],
      [t("proposedTime"), `${alt.date}, ${t("timeRange", { start: alt.start, end: alt.end })}`],
      [t("attendees"), String(r.participants)],
    ];
  } else if (kind === "rejected" || kind === "cancelled") {
    const when = formatRange(r.start_at, r.end_at, locale);
    rows = [...rows, [t("date"), `${when.date}, ${t("timeRange", { start: when.start, end: when.end })}`]];
  }

  const note = opts.message ?? (kind === "rejected" || kind === "cancelled" || kind === "alternative" ? r.status_reason ?? undefined : undefined);
  const extraHtml = note
    ? `<div style="white-space:pre-wrap;background:#f6f8f7;border-left:3px solid #1b5e4a;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:15px;line-height:1.6">${esc(note)}</div>`
    : undefined;

  const { html, text } = layout({
    company,
    heading: fill(tpl.heading, vars),
    intro: fill(tpl.intro, vars),
    rows,
    extraHtml,
    extraText: note,
    outro: fill(tpl.outro, vars),
    footer: t("footer", { company }),
    linkFallback: t("linkFallback"),
    address: addressLine(site),
  });

  return sendEmail({
    to: r.email,
    type: key,
    subject: fill(tpl.subject, vars),
    html,
    text,
    locale,
    bookingRequestId: r.id,
    bookingId: kind === "confirmed" ? r.booking_id : null,
    replyTo: site?.booking_email || null,
  });
}

/** Internal notification to the booking inbox (German, like the other admin emails). */
export async function sendRequestAdminNotification(requestId: string) {
  const admin = createAdminClient();
  const { data: priv } = await admin.from("private_settings").select("*").eq("id", 1).single();
  const site = await companyInfo();
  const to = site?.booking_email || priv?.contact_destination_email;
  if (!priv?.booking_admin_notification_enabled || !to) return;
  const r = await loadRequest(requestId);
  if (!r) return;
  const locale: Locale = "de";
  const tpl = await loadTemplate("request_admin_notification", locale);
  if (!tpl) return;
  const t = await getTranslations({ locale, namespace: "emails" });
  const company = site?.company_name ?? "Business Village";
  const vars = { name: r.full_name, reference: r.reference, resource: "" };
  const { html, text } = layout({
    company,
    heading: fill(tpl.heading, vars),
    intro: fill(tpl.intro, vars),
    rows: [
      [t("requestReference"), r.reference],
      [t("customer"), r.full_name],
      [t("email"), r.email],
      [t("phone"), r.phone ?? "–"],
      [t("company"), r.company ?? "–"],
      ...scheduleRows(r.requested_start, r.requested_end, r.requested_hours, r.requested_participants, locale, t),
      [t("estimatedPrice"), priceText(r, "estimate", locale, t)],
      [t("additionalRequests"), r.message ?? "–"],
      [t("customerLanguage"), r.locale.toUpperCase()],
    ],
    button: { label: t("openRequestInAdmin"), url: appUrl(`/de/admin/requests/${r.id}`) },
    outro: fill(tpl.outro, vars),
    footer: t("footer", { company }),
    linkFallback: t("linkFallback"),
  });
  return sendEmail({
    to,
    type: "request_admin_notification",
    subject: fill(tpl.subject, vars),
    html,
    text,
    locale,
    bookingRequestId: r.id,
    replyTo: r.email,
  });
}
