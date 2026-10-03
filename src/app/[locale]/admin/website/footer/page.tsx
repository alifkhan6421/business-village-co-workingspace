import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { FooterSettingsForm } from "@/components/admin/settings-forms";
import { Card, CardContent } from "@/components/ui/card";
import { mediaValues } from "@/lib/admin/queries";
import type { Locale } from "@/i18n/routing";

export default async function FooterPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "admin" });
  const supabase = await createClient();
  const { data: s } = await supabase.from("site_settings").select("*").eq("id", 1).single();
  const media = await mediaValues([s?.footer_logo_media_id]);
  return (
    <>
      <AdminPageHeader title={t("footer.title")} subtitle={t("website.footerDesc")} back={{ href: `/${locale}/admin/website`, label: t("nav.website") }} />
      <Card>
        <CardContent className="pt-6">
          <FooterSettingsForm v={(s ?? {}) as Record<string, unknown> & { social_links?: { label: string; url: string }[] }} footerLogo={s?.footer_logo_media_id ? media[s.footer_logo_media_id] ?? null : null} />
        </CardContent>
      </Card>
    </>
  );
}
