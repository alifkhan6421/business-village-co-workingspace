import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { SeoDefaultsForm } from "@/components/admin/settings-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { mediaValues } from "@/lib/admin/queries";
import type { Locale } from "@/i18n/routing";

export default async function SeoPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "admin" });
  const supabase = await createClient();
  const [{ data: s }, { data: pages }] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).single(),
    supabase.from("pages").select("id, slug, noindex, status, page_translations(locale, seo_title, seo_description)").order("slug"),
  ]);
  const media = await mediaValues([s?.default_seo_image_id]);
  const ok = (v?: string) => (v ? <Badge variant="success">✓</Badge> : <Badge variant="warning">–</Badge>);
  return (
    <>
      <AdminPageHeader title={t("seo.title")} subtitle={t("seo.subtitle")} back={{ href: `/${locale}/admin/website`, label: t("nav.website") }} />
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("seo.defaults")}</CardTitle></CardHeader>
          <CardContent>
            <SeoDefaultsForm v={(s ?? {}) as Record<string, unknown>} image={s?.default_seo_image_id ? media[s.default_seo_image_id] ?? null : null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("seo.perPage")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{t("common.slug")}</TH>
                  <TH>{t("pages.seoTitle")} DE / EN</TH>
                  <TH>{t("pages.seoDescription")} DE / EN</TH>
                  <TH>noindex</TH>
                </TR>
              </THead>
              <TBody>
                {(pages ?? []).map((p) => {
                  const de = p.page_translations.find((x) => x.locale === "de");
                  const en = p.page_translations.find((x) => x.locale === "en");
                  return (
                    <TR key={p.id}>
                      <TD><Link className="font-medium hover:underline" href={`/${locale}/admin/website/pages/${p.id}`}>/{p.slug}</Link></TD>
                      <TD>{ok(de?.seo_title)} {ok(en?.seo_title)}</TD>
                      <TD>{ok(de?.seo_description)} {ok(en?.seo_description)}</TD>
                      <TD>{p.noindex ? t("common.yes") : t("common.no")}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
