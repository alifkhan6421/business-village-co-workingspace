import { ResourceListPage } from "@/components/admin/resource-pages";
import type { Locale } from "@/i18n/routing";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; status?: string }> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  return <ResourceListPage kind="workspace" locale={locale} q={sp.q} status={sp.status} />;
}
