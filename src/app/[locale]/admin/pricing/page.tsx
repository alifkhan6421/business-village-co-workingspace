import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { PricingPackages, PricingSettingsForm, type PackageRow } from "@/components/admin/pricing-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mapPackage } from "@/lib/pricing/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/routing";

export default async function PricingAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "admin.pricing" });
  const supabase = await createClient();
  const [{ data: settings }, { data: packages }, { data: rooms }] = await Promise.all([
    supabase.from("pricing_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("pricing_packages").select("*, pricing_hourly_tiers(*)").order("sort_order").order("name_de"),
    supabase.from("rooms").select("id, name").order("display_order").order("name"),
  ]);
  const raw = (packages ?? []) as (Tables<"pricing_packages"> & { pricing_hourly_tiers: Tables<"pricing_hourly_tiers">[] })[];
  const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
  const rows: PackageRow[] = raw.map((p) => ({
    ...p,
    price: str(p.price),
    price_max: str(p.price_max),
    extra_hour_increment: String(p.extra_hour_increment),
    extra_person_price: str(p.extra_person_price),
    tiers: [...p.pricing_hourly_tiers].sort((a, b) => a.hours - b.hours).map((x) => ({ hours: x.hours, hourly_rate: String(x.hourly_rate), active: x.active })),
  }));

  return (
    <>
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxTitle")}</CardTitle>
            <CardDescription>{t("taxHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <PricingSettingsForm v={{ vat_rate: String(settings?.vat_rate ?? "19.00"), prices_include_vat: settings?.prices_include_vat ?? true, display_mode: settings?.display_mode ?? "gross" }} />
          </CardContent>
        </Card>
        <div>
          <h2 className="text-lg font-semibold">{t("packagesTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("packagesHint")}</p>
          <PricingPackages rows={rows} rooms={rooms ?? []} packages={raw.map(mapPackage)} />
        </div>
      </div>
    </>
  );
}
