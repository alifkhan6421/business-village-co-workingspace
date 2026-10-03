import { notFound } from "next/navigation";
import { getPage } from "@/lib/cms";
import type { Locale } from "@/i18n/routing";
import { SectionRenderer } from "./section-renderer";
import type { ListSearchParams } from "@/components/resources/resource-list";

export async function CmsPage({ slug, locale, searchParams }: { slug: string; locale: Locale; searchParams?: ListSearchParams }) {
  const page = await getPage(slug, locale);
  if (!page || page.status !== "published") notFound();
  return <SectionRenderer sections={page.sections} locale={locale} searchParams={searchParams} />;
}
