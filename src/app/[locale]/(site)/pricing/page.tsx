import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceCalculator } from "@/components/pricing/price-calculator";
import { loadPricingConfig } from "@/lib/pricing/server";
import { formatCents, formatVatRate, hourlyRate, type PricingPackage } from "@/lib/pricing/calc";
import { localizeHref } from "@/lib/href";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

// Rates come from the database on every request, so admin changes apply at once.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "pricing" });
  return buildMetadata({ locale, internalPath: "/pricing", title: t("title"), description: t("subtitle") });
}

export default async function PricingPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, config] = await Promise.all([getTranslations({ locale, namespace: "pricing" }), loadPricingConfig()]);
  const f = (c: number) => formatCents(c, locale);
  const name = (p: PricingPackage) => (locale === "de" ? p.nameDe : p.nameEn);
  const description = (p: PricingPackage) => (locale === "de" ? p.descriptionDe : p.descriptionEn);
  const hourly = config.packages.filter((p) => p.mode === "hourly_tiers" && p.tiers.length);
  const others = config.packages.filter((p) => p.mode !== "hourly_tiers");
  const vatNote = config.settings.pricesIncludeVat
    ? t("pricesInclVat", { rate: formatVatRate(config.settings.vatBasisPoints, locale) })
    : t("pricesExclVat", { rate: formatVatRate(config.settings.vatBasisPoints, locale) });

  const priceLabel = (p: PricingPackage) => {
    if (p.priceCents === null) return t("onRequest");
    if (p.mode === "per_person") {
      return p.priceMaxCents !== null && p.priceMaxCents > p.priceCents
        ? t("perPersonRange", { from: f(p.priceCents), to: f(p.priceMaxCents) })
        : t("perPerson", { price: f(p.priceCents) });
    }
    return p.durationUnit === "unspecified" ? f(p.priceCents) : `${f(p.priceCents)} ${t(`per.${p.durationUnit}`, { hours: p.durationHours ?? 0 })}`;
  };

  return (
    <div>
      <section className="border-b bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl" data-testid="page-title">{t("title")}</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 sm:px-6 sm:py-16">
        <PriceCalculator config={config} />

        {hourly.length ? (
          <section className="space-y-8">
            {hourly.map((p) => {
              const longest = Math.max(...p.tiers.map((x) => x.hours));
              const extra = Array.from({ length: Math.max(0, p.maxHours - longest) }, (_, i) => longest + i + 1);
              return (
                <div key={p.id}>
                  <h2 className="text-2xl font-bold tracking-tight">{name(p)}</h2>
                  {description(p) ? <p className="mt-1 text-muted-foreground">{description(p)}</p> : null}
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {p.maxParticipants ? t("upTo", { count: p.maxParticipants }) : t("anySize")}
                  </p>
                  <div className="mt-5 overflow-x-auto rounded-2xl border">
                    <table className="w-full min-w-[22rem] text-sm" data-testid="hourly-rates">
                      <thead className="bg-muted/60 text-left">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-semibold">{t("duration")}</th>
                          <th scope="col" className="px-4 py-3 font-semibold">{t("hourlyRate")}</th>
                          <th scope="col" className="px-4 py-3 text-right font-semibold">{t("total")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[...p.tiers.map((x) => x.hours), ...extra].map((h) => {
                          const rate = hourlyRate(p, h);
                          if (rate === null || h < p.minHours) return null;
                          return (
                            <tr key={h}>
                              <td className="px-4 py-2.5">{t("hoursOption", { count: h })}</td>
                              <td className="px-4 py-2.5 tabular-nums">{f(rate)}</td>
                              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{f(rate * h)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{t("hourlyNote")} {vatNote}</p>
                </div>
              );
            })}
          </section>
        ) : null}

        {others.length ? (
          <section>
            <h2 className="text-2xl font-bold tracking-tight">{t("packagesTitle")}</h2>
            <p className="mt-1 text-muted-foreground">{t("packagesSubtitle")}</p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="pricing-packages">
              {others.map((p) => (
                <article key={p.id} className="flex flex-col rounded-2xl border bg-card p-6 shadow-xs">
                  <h3 className="text-lg font-semibold">{name(p)}</h3>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight">{priceLabel(p)}</p>
                  {description(p) ? <p className="mt-3 text-sm text-muted-foreground">{description(p)}</p> : null}
                  <ul className="mt-4 space-y-1.5 text-sm text-foreground/80">
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {p.maxParticipants ? t("upTo", { count: p.maxParticipants }) : p.includedParticipants ? t("includes", { count: p.includedParticipants }) : t("anySize")}
                    </li>
                    {p.extraPersonPriceCents !== null && p.includedParticipants !== null ? (
                      <li>{t("extraPerson", { price: f(p.extraPersonPriceCents), count: p.includedParticipants })}</li>
                    ) : null}
                    {p.durationUnit === "unspecified" && p.mode !== "per_person" ? <li className="text-muted-foreground">{t("periodOnRequest")}</li> : null}
                  </ul>
                </article>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{vatNote}</p>
          </section>
        ) : null}

        <section className="rounded-2xl bg-primary px-6 py-10 text-primary-foreground sm:px-10">
          <h2 className="text-2xl font-bold tracking-tight">{t("ctaTitle")}</h2>
          <p className="mt-2 max-w-2xl text-primary-foreground/85">{t("ctaText")}</p>
          <Button asChild size="lg" variant="secondary" className="mt-6">
            <a href={localizeHref("/booking-request", locale)}>
              <Send /> {t("sendRequest")}
            </a>
          </Button>
        </section>
      </div>
    </div>
  );
}
