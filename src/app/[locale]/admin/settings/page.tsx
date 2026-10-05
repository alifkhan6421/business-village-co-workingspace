import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { BookingRulesForm, BusinessSettingsForm, ContactSettingsForm, EmailTemplatesForm, type TemplatePair } from "@/components/admin/settings-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mediaValues } from "@/lib/admin/queries";
import { emailConfigured } from "@/lib/email/send";
import type { Locale } from "@/i18n/routing";

const KEYS = ["booking_confirmation", "guest_booking_confirmation", "booking_updated", "booking_cancelled", "booking_message", "booking_admin_notification", "contact_confirmation", "contact_admin_notification", "welcome", "verify_email", "password_reset"];

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "admin.settings" });
  const supabase = await createClient();
  const [{ data: site }, { data: priv }, { data: tpls }] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).single(),
    supabase.from("private_settings").select("*").eq("id", 1).single(),
    supabase.from("email_templates").select("*"),
  ]);
  const media = await mediaValues([site?.logo_media_id, site?.favicon_media_id]);
  const empty = { subject: "", heading: "", intro: "", outro: "" };
  const templates: TemplatePair[] = KEYS.map((key) => {
    const pick = (l: string) => {
      const r = (tpls ?? []).find((x) => x.template_key === key && x.locale === l);
      return r ? { subject: r.subject, heading: r.heading, intro: r.intro, outro: r.outro } : empty;
    };
    return { key, de: pick("de"), en: pick("en") };
  });
  const configured = emailConfigured();
  return (
    <>
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="space-y-6">
        <Card id="business">
          <CardHeader><CardTitle className="text-base">{t("business")}</CardTitle></CardHeader>
          <CardContent>
            <BusinessSettingsForm v={(site ?? {}) as Record<string, unknown>} logo={site?.logo_media_id ? media[site.logo_media_id] ?? null : null} favicon={site?.favicon_media_id ? media[site.favicon_media_id] ?? null : null} />
          </CardContent>
        </Card>
        <Card id="booking">
          <CardHeader><CardTitle className="text-base">{t("bookingRules")}</CardTitle></CardHeader>
          <CardContent><BookingRulesForm v={(site ?? {}) as Record<string, unknown>} /></CardContent>
        </Card>
        <Card id="contact">
          <CardHeader><CardTitle className="text-base">{t("contactForm")}</CardTitle></CardHeader>
          <CardContent><ContactSettingsForm v={(priv ?? {}) as Record<string, unknown>} /></CardContent>
        </Card>
        <Card id="emails">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {t("emailTemplates")}
              <Badge variant={configured ? "success" : "warning"} className="whitespace-normal">{t("emailStatus")}: {configured ? t("emailConfigured") : t("emailNotConfigured")}</Badge>
            </CardTitle>
            <CardDescription />
          </CardHeader>
          <CardContent><EmailTemplatesForm templates={templates} /></CardContent>
        </Card>
      </div>
    </>
  );
}
