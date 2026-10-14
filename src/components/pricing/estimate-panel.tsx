"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { applicablePackages, formatCents, formatVatRate, PRICING_CATEGORIES, quotePackage, type PricingCategory, type PricingConfig, type Quote } from "@/lib/pricing/calc";

/** What to book (meeting room, event stairs, entire venue), pricing option picker, and net / VAT / gross breakdown. */
export function EstimatePanel({
  config,
  hours,
  participants,
  packageId,
  onPackageChange,
  locale,
  className,
}: {
  config: PricingConfig;
  hours: number;
  participants: number;
  packageId: string | null;
  onPackageChange: (id: string) => void;
  locale: "de" | "en";
  className?: string;
}) {
  const t = useTranslations("pricing");
  const categories = PRICING_CATEGORIES.filter((c) => config.packages.some((p) => p.active && p.category === c));
  const [category, setCategory] = useState<PricingCategory>(
    config.packages.find((p) => p.id === packageId)?.category ?? categories[0] ?? "meeting",
  );
  const all = hours > 0 && participants > 0 ? applicablePackages(config, hours, participants) : [];
  const options = all.filter((p) => p.category === category);
  const pkg = options.find((p) => p.id === packageId) ?? options[0];
  const chooseCategory = (c: PricingCategory) => {
    setCategory(c);
    onPackageChange(all.find((p) => p.category === c)?.id ?? "");
  };
  const res = pkg ? quotePackage(pkg, hours, participants, config.settings) : null;
  const quote = res?.ok ? res.quote : null;
  const name = (p: { nameDe: string; nameEn: string }) => (locale === "de" ? p.nameDe : p.nameEn);
  const optionPrice = (p: (typeof options)[number]) => {
    const q = quotePackage(p, hours, participants, config.settings);
    if (!q.ok) return null;
    const head = config.settings.displayMode === "gross" ? q.quote.grossCents : q.quote.netCents;
    return formatCents(head, locale);
  };

  return (
    <div className={cn("space-y-4", className)} data-testid="estimate-panel" aria-live="polite">
      {categories.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("whatToBook")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {categories.map((c) => (
              <label
                key={c}
                data-testid={`category-${c}`}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm font-medium transition-colors hover:border-foreground/20 has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input type="radio" name="pricing-what" value={c} checked={c === category} onChange={() => chooseCategory(c)} className="accent-[var(--primary)]" />
                <span className="min-w-0">{t(`categories.${c}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {options.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("category")}</legend>
          <div className="space-y-2">
            {options.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-3 text-sm transition-colors hover:border-foreground/20 has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="radio"
                  name="pricing-category"
                  value={p.id}
                  checked={p.id === pkg?.id}
                  onChange={() => onPackageChange(p.id)}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{name(p)}</span>
                  {(locale === "de" ? p.descriptionDe : p.descriptionEn) ? (
                    <span className="block text-xs text-muted-foreground">{locale === "de" ? p.descriptionDe : p.descriptionEn}</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{optionPrice(p)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {quote ? (
        <QuoteBreakdown quote={quote} config={config} locale={locale} showName={options.length <= 1} />
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-muted px-3.5 py-3 text-sm text-muted-foreground" data-testid="no-estimate">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {hours > 0 && participants > 0 ? t("noPackage") : t("enterDetails")}
        </p>
      )}
    </div>
  );
}

export function QuoteBreakdown({ quote, config, locale, showName = true }: { quote: Quote; config: Pick<PricingConfig, "settings">; locale: "de" | "en"; showName?: boolean }) {
  const t = useTranslations("pricing");
  const f = (c: number) => formatCents(c, locale);
  const headlineGross = config.settings.displayMode === "gross";
  const range = quote.maxGrossCents !== null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {showName ? <p className="text-sm font-semibold">{locale === "de" ? quote.packageName.de : quote.packageName.en}</p> : <span />}
        <Badge variant={quote.kind === "package" ? "success" : "info"} data-testid="estimate-kind">
          {quote.kind === "package" ? t("packagePrice") : t("estimate")}
        </Badge>
      </div>
      <dl className="space-y-1.5 text-sm">
        {quote.lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              {l.kind === "hourly"
                ? t("lineHourly", { hours: l.hours, rate: f(l.rateCents) })
                : l.kind === "tier_per_person"
                  ? t("lineTierPerPerson", { participants: l.participants, price: f(l.priceCents), hours: l.hours })
                  : l.kind === "fixed"
                    ? l.unit === "unspecified"
                      ? t("lineFixed")
                      : t("lineFixedUnits", { units: l.units, unit: t(`unit.${l.unit}`), price: f(l.priceCents) })
                    : l.kind === "per_person"
                      ? t("linePerPerson", { participants: l.participants, price: f(l.priceCents) })
                      : t("lineExtraPersons", { persons: l.persons, price: f(l.priceCents) })}
            </dt>
            <dd className="shrink-0 tabular-nums">
              {l.kind === "per_person" && l.maxAmountCents !== null ? `${f(l.amountCents)} – ${f(l.maxAmountCents)}` : f(l.amountCents)}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="space-y-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("net")}</dt>
          <dd className="tabular-nums" data-testid="estimate-net">{f(quote.netCents)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("vat", { rate: formatVatRate(quote.vatBasisPoints, locale) })}</dt>
          <dd className="tabular-nums" data-testid="estimate-vat">{f(quote.vatCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t pt-3">
          <dt className="font-semibold">{headlineGross ? t("gross") : t("net")}</dt>
          <dd className="text-2xl font-extrabold tracking-tight tabular-nums" data-testid="estimate-total">
            {headlineGross ? f(quote.grossCents) : f(quote.netCents)}
            {range && headlineGross ? <span className="text-base font-bold"> – {f(quote.maxGrossCents!)}</span> : null}
          </dd>
        </div>
        {!headlineGross ? (
          <div className="flex justify-between gap-3 text-muted-foreground">
            <dt>{t("gross")}</dt>
            <dd className="tabular-nums">
              {f(quote.grossCents)}
              {range ? ` – ${f(quote.maxGrossCents!)}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {quote.kind === "package" ? t("packageNote") : t("estimateNote")}
        {quote.periodUnconfirmed ? ` ${t("periodNote")}` : ""}
      </p>
    </div>
  );
}
