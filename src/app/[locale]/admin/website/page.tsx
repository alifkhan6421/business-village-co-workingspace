import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, FileText, Home, Mail, Menu, PanelBottom, Scale, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/i18n/routing";

export default async function WebsiteHub({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "admin" });
  const supabase = await createClient();
  const { data: pages } = await supabase.from("pages").select("id, slug, page_translations(locale, title)").in("slug", ["home", "contact", "imprint", "privacy", "terms"]);
  const id = (slug: string) => pages?.find((p) => p.slug === slug)?.id;
  const base = `/${locale}/admin/website`;
  const tiles = [
    { href: id("home") ? `${base}/pages/${id("home")}` : `${base}/pages`, icon: Home, title: t("website.homepage"), desc: t("website.homepageDesc") },
    { href: `${base}/pages`, icon: FileText, title: t("website.pages"), desc: t("website.pagesDesc") },
    { href: `${base}/navigation`, icon: Menu, title: t("website.navigation"), desc: t("website.navigationDesc") },
    { href: `${base}/footer`, icon: PanelBottom, title: t("website.footer"), desc: t("website.footerDesc") },
    { href: id("contact") ? `${base}/pages/${id("contact")}` : `${base}/pages`, icon: Mail, title: t("website.contact"), desc: t("website.contactDesc") },
    { href: `${base}/pages?type=legal`, icon: Scale, title: t("website.legal"), desc: t("website.legalDesc") },
    { href: `${base}/seo`, icon: Search, title: t("website.seo"), desc: t("website.seoDesc") },
  ];
  return (
    <>
      <AdminPageHeader title={t("website.title")} subtitle={t("website.subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((x) => (
          <Link key={x.title} href={x.href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="flex h-full items-start gap-4 p-5 transition-[border-color,box-shadow] group-hover:border-primary/30 group-hover:shadow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <x.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 font-semibold">
                  {x.title}
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">{x.desc}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        {t("website.businessInfoHint")}{" "}
        <Link href={`/${locale}/admin/settings#business`} className="text-primary hover:underline">{t("website.editBusinessInfo")} →</Link>
      </p>
    </>
  );
}
