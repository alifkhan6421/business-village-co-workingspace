import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { PageMetaForm, SectionsManager } from "@/components/admin/page-editor";
import { DeleteButton } from "@/components/admin/delete-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { loadPageEditor, publicPathFor } from "@/lib/admin/cms-queries";
import { deletePage } from "@/lib/admin/cms";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

export default async function PageEditorPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await loadPageEditor(id, locale);
  if (!data) notFound();
  const t = await getTranslations({ locale, namespace: "admin" });
  const path = publicPathFor(data.meta.slug, data.meta.is_system);
  return (
    <>
      <AdminPageHeader
        title={data.meta.de.title || data.meta.slug}
        subtitle={data.meta.is_system ? t("pages.systemHint") : `/${data.meta.slug}`}
        back={{ href: `/${locale}/admin/website/pages`, label: t("website.pages") }}
        actions={
          <>
            <a href={localizeHref(path, "de")} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}><ExternalLink /> DE</a>
            <a href={localizeHref(path, "en")} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}><ExternalLink /> EN</a>
            {!data.meta.is_system ? <DeleteButton action={deletePage.bind(null, id)} name={data.meta.de.title || data.meta.slug} label={t("pages.deletePage")} redirectTo={`/${locale}/admin/website/pages`} /> : null}
          </>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("pages.sections")}</CardTitle></CardHeader>
          <CardContent><SectionsManager pageId={id} sections={data.sections} amenities={data.amenities} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("seo.title")} & {t("common.details")}</CardTitle></CardHeader>
          <CardContent><PageMetaForm page={data.meta} /></CardContent>
        </Card>
      </div>
    </>
  );
}
