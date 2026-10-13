import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { NewPlanDialog, PackageCard, PackageDialog, PlanCard, TaxSettingsForm } from "@/components/admin/pricing-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { loadPricingConfig } from "@/lib/pricing/load";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/** Preisverwaltung: VAT settings, hourly plans with their duration tiers, and fixed packages. */
export default async function PricingAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const supabase = await createClient();
  const [t, config, { data: rooms }] = await Promise.all([
    getTranslations({ locale, namespace: "admin.pricing" }),
    loadPricingConfig({ client: supabase, includeInactive: true }),
    supabase.from("rooms").select("id, name, capacity").order("name"),
  ]);
  const roomOptions = rooms ?? [];
  return (
    <>
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="space-y-8">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("taxTitle")}</CardTitle></CardHeader>
          <CardContent><TaxSettingsForm v={config.settings} /></CardContent>
        </Card>

        <section className="space-y-4" aria-labelledby="plans-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="plans-title" className="text-lg font-semibold">{t("plansTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("plansIntro")}</p>
            </div>
            <NewPlanDialog rooms={roomOptions} />
          </div>
          {config.plans.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {config.plans.map((p) => <PlanCard key={p.id} plan={p} rooms={roomOptions} />)}
            </div>
          ) : (
            <EmptyState title={t("noPlans")} />
          )}
        </section>

        <section className="space-y-4" aria-labelledby="packages-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="packages-title" className="text-lg font-semibold">{t("packagesTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("packagesIntro")}</p>
            </div>
            <PackageDialog rooms={roomOptions} />
          </div>
          {config.packages.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {config.packages.map((p) => <PackageCard key={p.id} pkg={p} rooms={roomOptions} />)}
            </div>
          ) : (
            <EmptyState title={t("noPackages")} />
          )}
        </section>
      </div>
    </>
  );
}
