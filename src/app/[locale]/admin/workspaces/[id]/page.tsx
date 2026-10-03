import { ResourceEditPage } from "@/components/admin/resource-pages";
import type { Locale } from "@/i18n/routing";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return <ResourceEditPage kind="workspace" locale={locale as Locale} id={id} />;
}
