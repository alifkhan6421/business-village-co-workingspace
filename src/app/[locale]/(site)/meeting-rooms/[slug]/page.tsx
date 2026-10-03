import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ResourceDetail } from "@/components/resources/resource-detail";
import { getResourceBySlug } from "@/lib/resources";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: Locale; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const r = await getResourceBySlug("room", slug, locale);
  if (!r) return {};
  return buildMetadata({ locale, internalPath: `/meeting-rooms/${slug}`, title: `${r.name} | Business Village`, description: r.shortDescription, image: r.cover });
}

export default async function Page({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return <ResourceDetail type="room" slug={slug} locale={locale} query={await searchParams} />;
}
