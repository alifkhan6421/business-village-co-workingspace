import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/sanitize";

/**
 * Inbound email webhook (Resend "email.received").
 *
 * Only active when RESEND_WEBHOOK_SECRET is set and inbound receiving has been
 * configured for the domain (MX record + webhook in the Resend dashboard).
 * Replies are matched to bookings by the reference (BV-YYYY-NNNNNN) in the
 * subject and stored in booking_messages. Requests are verified with the
 * Svix signature Resend sends; anything unsigned is rejected.
 */
export const runtime = "nodejs";

const REF = /BV-\d{4}-\d{6}/i;

type Inbound = {
  type?: string;
  data?: {
    email_id?: string;
    id?: string;
    from?: string | { email?: string; name?: string };
    subject?: string;
    text?: string;
    html?: string;
  };
};

function parseFrom(from: string | { email?: string; name?: string } | undefined) {
  if (!from) return { email: "", name: null as string | null };
  if (typeof from === "object") return { email: from.email ?? "", name: from.name ?? null };
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { email: m[2].trim(), name: m[1].trim() || null } : { email: from.trim(), name: null };
}

/** Strips quoted history so only the new reply text is stored. */
function cleanReply(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((l) => /^(>|On .+wrote:|Am .+schrieb.*:|-----Original Message-----|Von: )/.test(l.trim()));
  return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trim().slice(0, 20000);
}

async function fetchBody(id: string): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "";
  const base = (process.env.EMAIL_API_BASE_URL || "https://api.resend.com").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/emails/receiving/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return "";
    const j = (await res.json()) as { text?: string; html?: string };
    return j.text || stripHtml(j.html ?? "");
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "inbound email not configured" }, { status: 503 });

  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let payload: Inbound;
  try {
    new Webhook(secret).verify(raw, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    });
    payload = JSON.parse(raw) as Inbound;
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (payload.type !== "email.received" || !payload.data) return NextResponse.json({ ok: true, ignored: true });
  const d = payload.data;
  const messageId = d.email_id ?? d.id ?? req.headers.get("svix-id") ?? null;
  const subject = (d.subject ?? "").slice(0, 500);
  const from = parseFrom(d.from);
  const ref = subject.match(REF)?.[0]?.toUpperCase();

  const admin = createAdminClient();
  let bookingId: string | null = null;
  if (ref) {
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", ref).maybeSingle();
    bookingId = data?.id ?? null;
  }
  let body = d.text || stripHtml(d.html ?? "");
  if (!body && messageId) body = await fetchBody(messageId);

  const { error } = await admin.from("booking_messages").insert({
    booking_id: bookingId,
    direction: "inbound",
    sender_email: from.email.slice(0, 254),
    sender_name: from.name?.slice(0, 200) ?? null,
    subject,
    message: cleanReply(body) || "(—)",
    provider_message_id: messageId,
  });
  // Duplicate deliveries (same provider id) are acknowledged without a second row.
  if (error && error.code !== "23505") return NextResponse.json({ error: "store failed" }, { status: 500 });
  return NextResponse.json({ ok: true, matched: !!bookingId });
}
