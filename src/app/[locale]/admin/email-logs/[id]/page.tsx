import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/i18n/routing";

export default async function EmailLogDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase.from("email_logs").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();
  const [t, f] = await Promise.all([getTranslations({ locale, namespace: "admin" }), getFormatter({ locale })]);
  return (
    <>
      <AdminPageHeader title={e.subject} back={{ href: `/${locale}/admin/email-logs`, label: t("nav.emailLogs") }} />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardContent className="pt-6">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted-foreground">{t("emailLogs.recipient")}</dt><dd className="break-all">{e.recipient}</dd></div>
              <div><dt className="text-muted-foreground">{t("emailLogs.type")}</dt><dd>{t.has(`emailLogs.types.${e.email_type}`) ? t(`emailLogs.types.${e.email_type}`) : e.email_type}</dd></div>
              <div><dt className="text-muted-foreground">{t("common.status")}</dt><dd><StatusBadge kind="email" value={e.status} /></dd></div>
              <div><dt className="text-muted-foreground">{t("common.date")}</dt><dd>{f.dateTime(new Date(e.created_at), "dateTime")}</dd></div>
              <div><dt className="text-muted-foreground">{t("emailLogs.providerId")}</dt><dd className="break-all font-mono text-xs">{e.provider_message_id ?? "—"}</dd></div>
              {e.error_message ? <div><dt className="text-muted-foreground">{t("emailLogs.error")}</dt><dd className="break-words text-destructive">{e.error_message}</dd></div> : null}
              {e.related_booking_id ? (
                <div><dt className="text-muted-foreground">{t("emailLogs.relatedBooking")}</dt><dd><Link className="text-primary hover:underline" href={`/${locale}/admin/bookings/${e.related_booking_id}`}>→</Link></dd></div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-base">{t("emailLogs.preview")}</CardTitle></CardHeader>
          <CardContent>
            {/* Stored HTML is rendered in a fully sandboxed frame (no scripts, no same-origin access). */}
            <iframe title={t("emailLogs.preview")} sandbox="" srcDoc={e.body_html ?? ""} className="h-[640px] w-full rounded-md border bg-white" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
