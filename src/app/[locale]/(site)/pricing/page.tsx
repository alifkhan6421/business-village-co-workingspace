import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Send, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceCalculator } from "@/components/pricing/price-calculator";
import { getSiteSettings } from "@/lib/cms";
import { createClient } from "@/lib/supabase/server";
import { loadPricingConfig } from "@/lib/pricing/load";
import { formatCents, hourlyRateCents, toCents } from "@/lib/pricing/calc";
import { localizeHref } from "@/lib/href";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

// Prices are read on every request so admin changes apply immediately.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "pricing" });
  return buildMetadata({ locale, internalPath: "/pricing", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function PricingPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, settings, config] = await Promise.all([
    getTranslations({ locale, namespace: "pricing" }),
    getSiteSettings(locale),
    loadPricingConfig({ client: await createClient() }),
  ]);
  const de = locale === "de";
  const fmt = (c: number) => formatCents(c, locale);
  const note = de ? config.settings.noteDe : config.settings.noteEn || config.settings.noteDe;
  const vatNote = config.settings.pricesIncludeVat ? t("pricesInclVat", { rate: config.settings.vatRate }) : t("pricesExclVat", { rate: config.settings.vatRate });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header className="mb-10 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">{t("eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 text-lg text-foreground/75">{t("intro")}</p>
      </header>

      <PriceCalculator config={config} maxHours={settings.booking_max_hours} />

      <p className="mt-4 text-sm text-muted-foreground">
        {vatNote}
        {note ? <span className="block whitespace-pre-line">{note}</span> : null}
      </p>

      {config.plans.length ? (
        <section className="mt-16" aria-labelledby="hourly-title">
          <h2 id="hourly-title" className="text-2xl font-bold tracking-tight">{t("hourlyTitle")}</h2>
          <p className="mt-1 text-muted-foreground">{t("hourlyIntro")}</p>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {config.plans.map((plan) => {
              const longest = plan.tiers.length ? plan.tiers[plan.tiers.length - 1].hours : 0;
              return (
                <div key={plan.id} className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6" data-testid="hourly-plan">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold">{de ? plan.nameDe : plan.nameEn}</h3>
                    <Badge variant="secondary"><Users /> {t("participantsRange", { min: plan.minParticipants, max: plan.maxParticipants })}</Badge>
                  </div>
                  {(de ? plan.descriptionDe : plan.descriptionEn) ? <p className="mt-1 text-sm text-muted-foreground">{de ? plan.descriptionDe : plan.descriptionEn}</p> : null}
                  <table className="mt-4 w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 font-medium">{t("duration")}</th>
                        <th className="py-2 text-right font-medium">{t("hourlyRate")}</th>
                        <th className="py-2 text-right font-medium">{t("total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.tiers.map((tier) => (
                        <tr key={tier.id} className="border-b last:border-0">
                          <td className="py-2">{t("hoursCount", { count: tier.hours })}</td>
                          <td className="py-2 text-right tabular-nums">{fmt(toCents(tier.hourlyRate))}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">{fmt(toCents(tier.hourlyRate) * tier.hours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.extraHourIncrement > 0 && longest && longest < plan.maxHours ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("extraHourNote", { hours: longest, increment: fmt(toCents(plan.extraHourIncrement)), example: fmt(hourlyRateCents(plan, longest + 1) ?? 0) })}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">{t("participantsNoMultiply")}</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {config.packages.length ? (
        <section className="mt-16" aria-labelledby="packages-title">
          <h2 id="packages-title" className="text-2xl font-bold tracking-tight">{t("packagesTitle")}</h2>
          <p className="mt-1 text-muted-foreground">{t("packagesIntro")}</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {config.packages.map((pkg) => {
              const duration = de ? pkg.durationLabelDe : pkg.durationLabelEn || pkg.durationLabelDe;
              const unit = pkg.pricingMode === "per_person" ? t("perPerson") : pkg.durationType === "hour" ? t("perHour") : "";
              return (
                <div key={pkg.id} className="flex flex-col rounded-2xl border bg-card p-5 shadow-xs" data-testid="price-package">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{de ? pkg.nameDe : pkg.nameEn}</h3>
                    <Badge variant={pkg.priceType === "fixed" ? "success" : "warning"}>{pkg.priceType === "fixed" ? t("typeFixed") : t("typeEstimate")}</Badge>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold tracking-tight">
                    {fmt(toCents(pkg.price))} {unit ? <span className="text-sm font-medium text-muted-foreground">{unit}</span> : null}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <li>{pkg.maxParticipants ? t("upToPeople", { count: pkg.maxParticipants }) : t("capacityOnRequest")}</li>
                    {pkg.extraPersonPrice !== null && pkg.maxParticipants ? <li>{t("extraPersonNote", { price: fmt(toCents(pkg.extraPersonPrice)), count: pkg.maxParticipants })}</li> : null}
                    <li>{t(`durationType.${pkg.durationType}`)}{duration ? ` · ${duration}` : ""}</li>
                  </ul>
                  {(de ? pkg.descriptionDe : pkg.descriptionEn) ? <p className="mt-3 text-sm text-foreground/80">{de ? pkg.descriptionDe : pkg.descriptionEn}</p> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-16 rounded-2xl bg-secondary/60 p-6 text-center sm:p-10">
        <h2 className="text-2xl font-bold tracking-tight">{t("ctaTitle")}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-foreground/75">{t("ctaText")}</p>
        <Button asChild size="lg" className="mt-6">
          <a href={localizeHref("/booking-request", locale)}><Send /> {t("sendRequest")}</a>
        </Button>
      </section>
    </div>
  );
}
