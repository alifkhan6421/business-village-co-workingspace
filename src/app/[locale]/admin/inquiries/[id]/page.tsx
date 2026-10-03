import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import { InquiryForm } from "@/components/admin/people-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";

export default async function InquiryDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: i } = await supabase.from("contact_requests").select("*").eq("id", id).maybeSingle();
  if (!i) notFound();
  const [t, f] = await Promise.all([getTranslations({ locale, namespace: "admin" }), getFormatter({ locale })]);
  const replySubject = encodeURIComponent(locale === "de" ? "Ihre Anfrage bei Business Village" : "Your inquiry at Business Village");
  return (
    <>
      <AdminPageHeader
        title={t("inquiries.detailTitle", { name: i.name })}
        subtitle={f.dateTime(new Date(i.created_at), "dateTime")}
        back={{ href: `/${locale}/admin/inquiries`, label: t("nav.inquiries") }}
        actions={
          <a href={`mailto:${i.email}?subject=${replySubject}`} className={buttonVariants({ variant: "outline" })}>
            <Mail /> {t("inquiries.replyByEmail")}
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("inquiries.message")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t("common.email")}</dt><dd className="break-words">{i.email}</dd>
              <dt className="text-muted-foreground">{t("common.phone")}</dt><dd>{i.phone || "—"}</dd>
              <dt className="text-muted-foreground">{t("common.company")}</dt><dd>{i.company || "—"}</dd>
              <dt className="text-muted-foreground">{t("users.language")}</dt><dd>{i.locale.toUpperCase()}</dd>
              <dt className="text-muted-foreground">{t("common.status")}</dt><dd><StatusBadge kind="inquiry" value={i.status} /></dd>
            </dl>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">{i.message}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("inquiries.notes")}</CardTitle></CardHeader>
          <CardContent><InquiryForm i={{ id: i.id, status: i.status, admin_notes: i.admin_notes }} /></CardContent>
        </Card>
      </div>
    </>
  );
}
