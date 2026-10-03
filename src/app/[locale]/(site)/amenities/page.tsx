import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CmsPage } from "@/components/sections/cms-page";
import { getPage } from "@/lib/cms";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: Locale }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata({ locale, internalPath: "/amenities", page: await getPage("amenities", locale) });
}

export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CmsPage slug="amenities" locale={locale} searchParams={await searchParams} />;
}
