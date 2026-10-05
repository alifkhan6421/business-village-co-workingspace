import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import { NewPageForm } from "@/components/admin/page-editor";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/i18n/routing";

export default async function PagesList({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ type?: string }> }) {
  const locale = (await params).locale as Locale;
  const { type } = await searchParams;
  const [t, ts, f] = await Promise.all([getTranslations({ locale, namespace: "admin" }), getTranslations({ locale, namespace: "status.pageType" }), getFormatter({ locale })]);
  const supabase = await createClient();
  let q = supabase.from("pages").select("id, slug, page_type, status, is_system, updated_at, page_translations(locale, title, seo_title, seo_description), page_sections(id, page_section_translations(locale, title, content))").order("is_system", { ascending: false }).order("slug");
  if (type === "legal" || type === "landing" || type === "standard") q = q.eq("page_type", type);
  const { data } = await q;
  const base = `/${locale}/admin/website/pages`;
  return (
    <>
      <AdminPageHeader title={t("pages.title")} subtitle={t("website.pagesDesc")} back={{ href: `/${locale}/admin/website`, label: t("nav.website") }} />
      <Table stack>
        <THead>
          <TR>
            <TH>{t("pages.pageTitle")}</TH>
            <TH className="hidden sm:table-cell">{t("pages.pageType")}</TH>
            <TH>{t("common.status")}</TH>
            <TH>{t("common.translationStatus")}</TH>
            <TH className="hidden lg:table-cell">{t("common.createdAt")}</TH>
          </TR>
        </THead>
        <TBody>
          {(data ?? []).map((p) => {
            const de = p.page_translations.find((x) => x.locale === "de");
            const en = p.page_translations.find((x) => x.locale === "en");
            const sectionsMissingEn = p.page_sections.filter((s) => {
              const sd = s.page_section_translations.find((x) => x.locale === "de");
              const se = s.page_section_translations.find((x) => x.locale === "en");
              return !!(sd?.title || sd?.content) && !(se?.title || se?.content);
            }).length;
            const complete = !!en?.title && sectionsMissingEn === 0;
            return (
              <TR key={p.id}>
                <TD>
                  <Link href={`${base}/${p.id}`} className="font-medium hover:underline">{de?.title || p.slug}</Link>
                  <div className="text-xs text-muted-foreground">
                    /{p.slug} {p.is_system ? <Badge variant="muted" className="ml-1">{t("pages.system")}</Badge> : null}
                  </div>
                </TD>
                <TD className="hidden sm:table-cell">{ts(p.page_type)}</TD>
                <TD><StatusBadge kind="page" value={p.status} /></TD>
                <TD>
                  <Badge variant="success">DE ✓</Badge>{" "}
                  {complete ? <Badge variant="success">EN ✓</Badge> : <Badge variant="warning">EN {t("common.missing")}{sectionsMissingEn ? ` (${sectionsMissingEn})` : ""}</Badge>}
                </TD>
                <TD className="hidden lg:table-cell text-sm text-muted-foreground">{f.dateTime(new Date(p.updated_at), "dateTime")}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">{t("pages.new")}</CardTitle></CardHeader>
        <CardContent><NewPageForm /></CardContent>
      </Card>
    </>
  );
}
