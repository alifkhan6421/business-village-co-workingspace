import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { NavManager } from "@/components/admin/nav-manager";
import type { Locale } from "@/i18n/routing";

export default async function NavigationPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "admin" });
  const supabase = await createClient();
  const { data } = await supabase.from("navigation_items").select("*").order("display_order");
  return (
    <>
      <AdminPageHeader title={t("navigation.title")} subtitle={t("navigation.subtitle")} back={{ href: `/${locale}/admin/website`, label: t("nav.website") }} />
      <NavManager items={data ?? []} />
    </>
  );
}
