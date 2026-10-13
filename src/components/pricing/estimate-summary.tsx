"use client";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatCents, optionName, type Estimate, type PricingSettings } from "@/lib/pricing/calc";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Net / VAT / gross breakdown of an estimate, with an "estimate" or "package price" badge. */
export function EstimateSummary({ estimate, settings, className }: { estimate: Estimate | null; settings: PricingSettings; className?: string }) {
  const t = useTranslations("pricing");
  const locale = useLocale() as Locale;
  if (!estimate) {
    return (
      <div className={cn("rounded-xl border border-dashed p-4 text-sm text-muted-foreground", className)} data-testid="estimate-none">
        <p className="font-semibold text-foreground">{t("onRequestTitle")}</p>
        <p className="mt-1">{t("onRequestText")}</p>
      </div>
    );
  }
  const fmt = (c: number) => formatCents(c, locale);
  const grossFirst = settings.displayMode !== "net";
  const lineLabel = (code: string, q: number, unit: number) => {
    if (code === "hourly") return t("lineHourly", { hours: q, rate: fmt(unit) });
    if (code === "per_person") return t("linePerPerson", { count: q, rate: fmt(unit) });
    if (code === "extra_person") return t("lineExtraPerson", { count: q, rate: fmt(unit) });
    return q > 1 ? t("linePackageTimes", { count: q, rate: fmt(unit) }) : t("linePackage");
  };
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)} data-testid="estimate">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold" data-testid="estimate-option">{optionName(estimate.option, locale)}</p>
        <Badge variant={estimate.option.priceType === "fixed" ? "success" : "warning"} data-testid="estimate-type">
          {estimate.option.priceType === "fixed" ? t("typeFixed") : t("typeEstimate")}
        </Badge>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        {estimate.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span>{lineLabel(l.code, l.quantity, l.unitCents)}</span>
            <span className="tabular-nums">{fmt(l.totalCents)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
        {settings.showVatBreakdown ? (
          <>
            <div className={cn("flex justify-between gap-3", !grossFirst && "text-base font-bold")}>
              <dt>{t("net")}</dt>
              <dd className="tabular-nums" data-testid="estimate-net">{fmt(estimate.netCents)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-muted-foreground">
              <dt>{t("vat", { rate: estimate.vatRate.toLocaleString(locale === "de" ? "de-DE" : "en-GB") })}</dt>
              <dd className="tabular-nums" data-testid="estimate-vat">{fmt(estimate.vatCents)}</dd>
            </div>
          </>
        ) : null}
        <div className={cn("flex items-baseline justify-between gap-3", grossFirst ? "pt-1 text-xl font-extrabold tracking-tight" : "text-muted-foreground")}>
          <dt className={grossFirst ? "text-base font-bold" : ""}>{t("gross")}</dt>
          <dd className="tabular-nums" data-testid="estimate-gross">{fmt(estimate.grossCents)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        {estimate.option.priceType === "fixed" ? t("fixedHint") : t("estimateHint")}
      </p>
    </div>
  );
}
