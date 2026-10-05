import "server-only";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/i18n/routing";
import { TIME_ZONE } from "@/lib/tz";
import { appUrl, localizeHref } from "@/lib/href";
import { sendEmail } from "./send";

export type TemplateKey =
  | "welcome"
  | "verify_email"
  | "password_reset"
  | "booking_confirmation"
  | "guest_booking_confirmation"
  | "booking_updated"
  | "booking_cancelled"
  | "contact_confirmation"
  | "contact_admin_notification"
  | "booking_admin_notification"
  | "booking_message";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function fill(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

async function loadTemplate(key: TemplateKey, locale: Locale) {
  const admin = createAdminClient();
  const { data } = await admin.from("email_templates").select("*").eq("template_key", key).in("locale", [locale, "de"]);
  return data?.find((t) => t.locale === locale) ?? data?.find((t) => t.locale === "de") ?? null;
}

async function companyInfo() {
  const admin = createAdminClient();
  const { data } = await admin.from("site_settings").select("*").eq("id", 1).single();
  return data;
}

type Row = [label: string, value: string];

/** Renders the shared HTML + text layout used by every transactional email. */
function layout(opts: {
  company: string;
  heading: string;
  intro: string;
  rows?: Row[];
  extraHtml?: string;
  extraText?: string;
  button?: { label: string; url: string };
  outro?: string;
  footer: string;
  linkFallback: string;
  address?: string;
}) {
  const rows = opts.rows ?? [];
  // Matches the site: white card, green brand, soft grey surface, rounded corners.
  const C = { brand: "#1b5e4a", text: "#17231e", muted: "#5f6d67", surface: "#f6f8f7", border: "#e4e9e6", page: "#f1f4f2" };
  const font = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
  const rowsHtml = rows.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;margin:24px 0;background:${C.surface};border:1px solid ${C.border};border-radius:12px">${rows
        .map(
          ([l, v], i) =>
            `<tr><td style="padding:12px 16px;color:${C.muted};font-size:13px;width:38%;vertical-align:top;${i ? `border-top:1px solid ${C.border};` : ""}">${esc(l)}</td><td style="padding:12px 16px;font-size:14px;font-weight:600;color:${C.text};${i ? `border-top:1px solid ${C.border};` : ""}">${esc(v).replace(/\n/g, "<br>")}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const buttonHtml = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td style="border-radius:10px;background:${C.brand}"><a href="${esc(opts.button.url)}" style="display:inline-block;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:15px">${esc(opts.button.label)}</a></td></tr></table><p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${C.muted}">${esc(opts.linkFallback)}<br><a href="${esc(opts.button.url)}" style="color:${C.brand};word-break:break-all">${esc(opts.button.url)}</a></p>`
    : "";
  const initials = opts.company
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:${C.page};font-family:${font};color:${C.text};-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:36px;height:36px;border-radius:10px;background:${C.brand};color:#ffffff;font-size:13px;font-weight:800;text-align:center;vertical-align:middle">${esc(initials || "BV")}</td><td style="padding-left:10px;font-size:17px;font-weight:800;color:${C.text}">${esc(opts.company)}</td></tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${C.border};border-radius:16px;padding:32px 28px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-.01em">${esc(opts.heading)}</h1>
<p style="margin:0;font-size:15px;line-height:1.65;color:${C.text}">${esc(opts.intro).replace(/\n/g, "<br>")}</p>
${rowsHtml}${opts.extraHtml ?? ""}${buttonHtml}
${opts.outro ? `<p style="margin:24px 0 0;font-size:15px;line-height:1.65">${esc(opts.outro)}</p>` : ""}
</td></tr>
<tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:${C.muted};text-align:center">${esc(opts.footer)}${opts.address ? `<br>${esc(opts.address)}` : ""}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    opts.heading,
    "",
    opts.intro,
    "",
    ...rows.map(([l, v]) => `${l}: ${v}`),
    opts.extraText ? `\n${opts.extraText}` : "",
    opts.button ? `\n${opts.button.label}: ${opts.button.url}` : "",
    opts.outro ? `\n${opts.outro}` : "",
    "",
    "—",
    opts.footer,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
  return { html, text };
}

export function formatRange(start: string, end: string, locale: Locale) {
  const s = new Date(start);
  const e = new Date(end);
  const date = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(s);
  const time = (d: Date) =>
    new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date, start: time(s), end: time(e) };
}

async function loadBooking(bookingId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("*, workspaces(name, floor, zone), rooms(name, floor), profiles!bookings_user_id_fkey(first_name, last_name, email, preferred_locale), guests(first_name, last_name, email, phone, company, locale)")
    .eq("id", bookingId)
    .single();
  return data;
}

function addressLine(s: Awaited<ReturnType<typeof companyInfo>>) {
  if (!s) return "";
  return [s.address_line_1, s.address_line_2, [s.postcode, s.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Booking emails to the customer. Language: member's saved preference,
 * otherwise the locale stored with the booking, otherwise German.
 */
export async function sendBookingEmail(
  bookingId: string,
  kind: "confirmation" | "updated" | "cancelled" | "message",
  opts: { manageToken?: string; message?: string } = {},
) {
  const b = await loadBooking(bookingId);
  if (!b) return;
  const profile = b.profiles as { first_name: string; last_name: string; email: string; preferred_locale: string } | null;
  const guest = b.guests as { first_name: string; last_name: string; email: string; locale: string } | null;
  const to = profile?.email ?? guest?.email;
  if (!to) return;
  const locale = ((profile?.preferred_locale ?? b.locale ?? guest?.locale ?? "de") === "en" ? "en" : "de") as Locale;
  const name = profile ? profile.first_name : guest?.first_name ?? "";
  const resource = (b.workspaces as { name: string } | null)?.name ?? (b.rooms as { name: string } | null)?.name ?? "";
  const floor = (b.workspaces as { floor: string } | null)?.floor ?? (b.rooms as { floor: string } | null)?.floor ?? "";

  const t = await getTranslations({ locale, namespace: "emails" });
  const ts = await getTranslations({ locale, namespace: "status" });
  const site = await companyInfo();
  const key: TemplateKey =
    kind === "confirmation"
      ? guest && !profile
        ? "guest_booking_confirmation"
        : "booking_confirmation"
      : kind === "updated"
        ? "booking_updated"
        : kind === "cancelled"
          ? "booking_cancelled"
          : "booking_message";
  const tpl = await loadTemplate(key, locale);
  if (!tpl) return;
  const vars = { name, reference: b.booking_reference, resource };
  const when = formatRange(b.start_at, b.end_at, locale);

  const rows: Row[] = [
    [t("reference"), b.booking_reference],
    [t("resource"), resource],
    [t("date"), when.date],
    [t("time"), t("timeRange", { start: when.start, end: when.end })],
    [t("location"), [site?.company_name, floor, addressLine(site)].filter(Boolean).join(", ")],
    [t("status"), ts(`booking.${b.status}`)],
  ];

  let button: { label: string; url: string } | undefined;
  if (kind !== "cancelled") {
    if (opts.manageToken) {
      button = { label: t("manageBooking"), url: appUrl(localizeHref(`/booking/manage/${opts.manageToken}`, locale)) };
    } else if (profile) {
      button = { label: t("manageBooking"), url: appUrl(localizeHref("/account/bookings", locale)) };
    }
  }

  const extraHtml = opts.message
    ? `<div style="white-space:pre-wrap;background:#f6f8f7;border-left:3px solid #1b5e4a;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:15px;line-height:1.6">${esc(opts.message)}</div>`
    : undefined;

  const { html, text } = layout({
    company: site?.company_name ?? "Business Village",
    heading: fill(tpl.heading, vars),
    intro: fill(tpl.intro, vars),
    rows: kind === "message" ? [[t("reference"), b.booking_reference], [t("resource"), resource]] : rows,
    extraHtml,
    extraText: opts.message,
    button,
    outro: fill(tpl.outro, vars),
    footer: t("footer", { company: site?.company_name ?? "Business Village" }),
    linkFallback: t("linkFallback"),
    address: addressLine(site),
  });

  return sendEmail({
    to,
    type: key,
    subject: fill(tpl.subject, vars),
    html,
    text,
    locale,
    bookingId: b.id,
    replyTo: site?.booking_email || null,
    redact: opts.manageToken ? [opts.manageToken] : [],
  });
}

/** Internal notification to the Business Village booking inbox. */
export async function sendBookingAdminNotification(bookingId: string) {
  const admin = createAdminClient();
  const { data: priv } = await admin.from("private_settings").select("*").eq("id", 1).single();
  const site = await companyInfo();
  const to = site?.booking_email || priv?.contact_destination_email;
  if (!priv?.booking_admin_notification_enabled || !to) return;
  const b = await loadBooking(bookingId);
  if (!b) return;
  const locale: Locale = "de";
  const t = await getTranslations({ locale, namespace: "emails" });
  const ts = await getTranslations({ locale, namespace: "status" });
  const tpl = await loadTemplate("booking_admin_notification", locale);
  if (!tpl) return;
  const profile = b.profiles as { first_name: string; last_name: string; email: string } | null;
  const guest = b.guests as { first_name: string; last_name: string; email: string; phone: string | null; company: string | null } | null;
  const person = profile ?? guest;
  const resource = (b.workspaces as { name: string } | null)?.name ?? (b.rooms as { name: string } | null)?.name ?? "";
  const when = formatRange(b.start_at, b.end_at, locale);
  const vars = { name: person ? `${person.first_name} ${person.last_name}` : "", reference: b.booking_reference, resource };
  const { html, text } = layout({
    company: site?.company_name ?? "Business Village",
    heading: fill(tpl.heading, vars),
    intro: fill(tpl.intro, vars),
    rows: [
      [t("reference"), b.booking_reference],
      [t("resource"), resource],
      [t("date"), when.date],
      [t("time"), t("timeRange", { start: when.start, end: when.end })],
      [t("customer"), `${vars.name} (${profile ? t("member") : t("guest")})`],
      [t("email"), person?.email ?? ""],
      [t("attendees"), String(b.attendees)],
      [t("purpose"), b.purpose ?? "–"],
      [t("status"), ts(`booking.${b.status}`)],
    ],
    button: { label: t("openInAdmin"), url: appUrl(`/de/admin/bookings/${b.id}`) },
    outro: fill(tpl.outro, vars),
    footer: t("footer", { company: site?.company_name ?? "Business Village" }),
    linkFallback: t("linkFallback"),
  });
  return sendEmail({ to, type: "booking_admin_notification", subject: fill(tpl.subject, vars), html, text, locale, bookingId: b.id });
}

export async function sendContactEmails(requestId: string) {
  const admin = createAdminClient();
  const { data: req } = await admin.from("contact_requests").select("*").eq("id", requestId).single();
  if (!req) return;
  const { data: priv } = await admin.from("private_settings").select("*").eq("id", 1).single();
  const site = await companyInfo();
  const company = site?.company_name ?? "Business Village";

  if (priv?.contact_admin_notification_enabled && priv.contact_destination_email) {
    const t = await getTranslations({ locale: "de", namespace: "emails" });
    const tpl = await loadTemplate("contact_admin_notification", "de");
    if (tpl) {
      const vars = { name: req.name, reference: "", resource: "" };
      const { html, text } = layout({
        company,
        heading: fill(tpl.heading, vars),
        intro: fill(tpl.intro, vars),
        rows: [
          [t("name"), req.name],
          [t("email"), req.email],
          [t("company"), req.company ?? "–"],
          [t("phone"), req.phone ?? "–"],
          [t("message"), req.message],
        ],
        button: { label: t("openInAdmin"), url: appUrl(`/de/admin/inquiries/${req.id}`) },
        footer: t("footer", { company }),
        linkFallback: t("linkFallback"),
      });
      await sendEmail({
        to: priv.contact_destination_email,
        type: "contact_admin_notification",
        subject: fill(tpl.subject, vars),
        html,
        text,
        locale: "de",
        contactRequestId: req.id,
        replyTo: req.email,
      });
    }
  }

  if (priv?.contact_confirmation_enabled) {
    const locale = (req.locale === "en" ? "en" : "de") as Locale;
    const t = await getTranslations({ locale, namespace: "emails" });
    const tpl = await loadTemplate("contact_confirmation", locale);
    if (tpl) {
      const vars = { name: req.name, reference: "", resource: "" };
      const { html, text } = layout({
        company,
        heading: fill(tpl.heading, vars),
        intro: fill(tpl.intro, vars),
        rows: [[t("message"), req.message]],
        outro: fill(tpl.outro, vars),
        footer: t("footer", { company }),
        linkFallback: t("linkFallback"),
        address: addressLine(site),
      });
      await sendEmail({
        to: req.email,
        type: "contact_confirmation",
        subject: fill(tpl.subject, vars),
        html,
        text,
        locale,
        contactRequestId: req.id,
        replyTo: site?.general_email || null,
      });
    }
  }
}

/** Account emails (verification, password reset, welcome) in the user's language. */
export async function sendAccountEmail(
  key: "verify_email" | "password_reset" | "welcome",
  to: string,
  locale: Locale,
  name: string,
  actionUrl?: string,
) {
  const t = await getTranslations({ locale, namespace: "emails" });
  const tpl = await loadTemplate(key, locale);
  const site = await companyInfo();
  if (!tpl) return;
  const company = site?.company_name ?? "Business Village";
  const vars = { name, reference: "", resource: "" };
  const label = key === "verify_email" ? t("confirmEmailButton") : key === "password_reset" ? t("resetPasswordButton") : t("loginButton");
  const url = actionUrl ?? appUrl(localizeHref("/login", locale));
  const { html, text } = layout({
    company,
    heading: fill(tpl.heading, vars),
    intro: fill(tpl.intro, vars),
    button: { label, url },
    outro: fill(tpl.outro, vars),
    footer: t("footer", { company }),
    linkFallback: t("linkFallback"),
    address: addressLine(site),
  });
  return sendEmail({
    to,
    type: key,
    subject: fill(tpl.subject, vars),
    html,
    text,
    locale,
    // Verification and reset links are credentials: never store them in the log.
    redact: key === "welcome" || !actionUrl ? [] : [actionUrl, actionUrl.replace(/&/g, "&amp;")],
  });
}
