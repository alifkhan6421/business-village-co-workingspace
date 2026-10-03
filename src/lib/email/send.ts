import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type SendEmailInput = {
  to: string;
  type: string;
  subject: string;
  html: string;
  text: string;
  locale?: "de" | "en";
  bookingId?: string | null;
  contactRequestId?: string | null;
  replyTo?: string | null;
  /** Strings removed from the stored copy of the body (e.g. management tokens). */
  redact?: string[];
};

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Sends a transactional email through Resend and records it in email_logs.
 * Never throws: email problems must not break bookings or form submissions.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = createAdminClient();
  let storedBody = input.html;
  for (const secret of input.redact ?? []) if (secret) storedBody = storedBody.split(secret).join("[redacted]");

  const { data: log } = await admin
    .from("email_logs")
    .insert({
      recipient: input.to,
      email_type: input.type,
      subject: input.subject,
      locale: input.locale ?? null,
      related_booking_id: input.bookingId ?? null,
      related_contact_request_id: input.contactRequestId ?? null,
      status: "pending",
      body_html: storedBody,
    })
    .select("id")
    .single();

  const finish = async (patch: { status: "sent" | "failed"; provider_message_id?: string | null; error_message?: string | null }) => {
    if (log) await admin.from("email_logs").update(patch).eq("id", log.id);
  };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Business Village <booking@business-village.de>";
  if (!apiKey) {
    const error = "Email provider not configured (RESEND_API_KEY missing) – email was not sent";
    await finish({ status: "failed", error_message: error });
    if (process.env.NODE_ENV !== "production") console.warn(`[email] ${error}: ${input.type} → ${input.to}`);
    return { ok: false, error };
  }

  try {
    const base = (process.env.EMAIL_API_BASE_URL || "https://api.resend.com").replace(/\/$/, "");
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo || process.env.EMAIL_REPLY_TO || undefined,
        tags: [{ name: "type", value: input.type }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      const error = `${res.status} ${body.name ?? ""} ${body.message ?? ""}`.trim();
      await finish({ status: "failed", error_message: error });
      return { ok: false, error };
    }
    await finish({ status: "sent", provider_message_id: body.id ?? null });
    return { ok: true, id: body.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await finish({ status: "failed", error_message: error });
    return { ok: false, error };
  }
}
