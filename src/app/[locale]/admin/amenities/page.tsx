import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AmenityManager, type AmenityRow } from "@/components/admin/amenity-manager";
import type { Locale } from "@/i18n/routing";

export default async function AmenitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "admin.amenities" });
  const supabase = await createClient();
  const [{ data }, { data: usage }] = await Promise.all([
    supabase.from("amenities").select("*, amenity_translations(*)").order("display_order").order("slug"),
    supabase.rpc("amenity_usage_counts"),
  ]);
  const use = new Map((usage ?? []).map((u) => [u.amenity_id, Number(u.workspace_count) + Number(u.room_count)]));
  const rows: AmenityRow[] = (data ?? []).map((a) => {
    const de = a.amenity_translations.find((x) => x.locale === "de");
    const en = a.amenity_translations.find((x) => x.locale === "en");
    return {
      id: a.id,
      slug: a.slug,
      icon: a.icon,
      amenity_type: a.amenity_type,
      display_order: a.display_order,
      active: a.active,
      name_de: de?.name ?? "",
      name_en: en?.name ?? "",
      description_de: de?.description ?? "",
      description_en: en?.description ?? "",
      usage: use.get(a.id) ?? 0,
    };
  });
  return (
    <>
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />
      <AmenityManager rows={rows} locale={locale} />
    </>
  );
}
