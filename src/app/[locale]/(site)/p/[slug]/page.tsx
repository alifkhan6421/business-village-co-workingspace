import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CmsPage } from "@/components/sections/cms-page";
import { getPage } from "@/lib/cms";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: Locale; slug: string }> };

/** Additional pages created by admins under Website → Pages. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  return buildMetadata({ locale, internalPath: `/p/${slug}`, page: await getPage(slug, locale) });
}

export default async function CustomPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return <CmsPage slug={slug} locale={locale} />;
}
