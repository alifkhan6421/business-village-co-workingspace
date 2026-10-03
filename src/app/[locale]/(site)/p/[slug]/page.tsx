import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CmsPage } from "@/components/sections/cms-page";
import { getPage } from "@/lib/cms";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Additional pages created by admins under Website → Pages. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = (await params).locale as Locale;
  return buildMetadata({ locale, internalPath: `/p/${slug}`, page: await getPage(slug, locale) });
}

export default async function CustomPage({ params }: Props) {
  const { slug } = await params;
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  return <CmsPage slug={slug} locale={locale} />;
}
