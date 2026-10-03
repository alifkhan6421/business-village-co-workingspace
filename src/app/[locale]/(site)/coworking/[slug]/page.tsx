import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ResourceDetail } from "@/components/resources/resource-detail";
import { getResourceBySlug } from "@/lib/resources";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = (await params).locale as Locale;
  const r = await getResourceBySlug("workspace", slug, locale);
  if (!r) return {};
  return buildMetadata({ locale, internalPath: `/coworking/${slug}`, title: `${r.name} | Business Village`, description: r.shortDescription, image: r.cover });
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  return <ResourceDetail type="workspace" slug={slug} locale={locale} query={await searchParams} />;
}
