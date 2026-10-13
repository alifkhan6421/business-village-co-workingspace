"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { localizeHref } from "@/lib/href";
import { applicablePackages, hourBounds, type PricingConfig } from "@/lib/pricing/calc";
import type { Locale } from "@/i18n/routing";
import { EstimatePanel } from "./estimate-panel";

/** Public price calculator: no account needed. Leads to the central booking request form. */
export function PriceCalculator({ config, maxParticipants = 500 }: { config: PricingConfig; maxParticipants?: number }) {
  const t = useTranslations("pricing");
  const locale = useLocale() as Locale;
  const bounds = hourBounds(config);
  const [hours, setHours] = useState(Math.min(Math.max(4, bounds.min), bounds.max));
  const [people, setPeople] = useState("8");
  const [packageId, setPackageId] = useState<string | null>(null);
  const participants = Number(people);
  const validPeople = Number.isInteger(participants) && participants >= 1 && participants <= maxParticipants;
  const chosen = validPeople ? (applicablePackages(config, hours, participants).find((p) => p.id === packageId) ?? null) : null;

  const query = new URLSearchParams({ hours: String(hours), people: validPeople ? String(participants) : "" });
  if (chosen) query.set("package", chosen.id);
  const href = `${localizeHref("/booking-request", locale)}?${query.toString()}`;
  const hourOptions = Array.from({ length: bounds.max - bounds.min + 1 }, (_, i) => bounds.min + i);

  return (
    <div className="grid gap-6 rounded-2xl border bg-card p-5 shadow-lg sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10" data-testid="price-calculator">
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t("calculatorTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("calculatorHint")}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("duration")} htmlFor="calc-hours">
            <NativeSelect id="calc-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {hourOptions.map((h) => (
                <option key={h} value={h}>{t("hoursOption", { count: h })}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("participants")} htmlFor="calc-people" error={people && !validPeople ? t("participantsInvalid", { max: maxParticipants }) : undefined}>
            <Input
              id="calc-people"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxParticipants}
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              aria-invalid={!!people && !validPeople}
            />
          </Field>
        </div>
        <Button asChild size="lg" className="w-full" data-testid="calc-send-request">
          <a href={href}>
            <Send /> {t("sendRequest")}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">{t("requestNote")}</p>
      </div>
      <div className="rounded-xl border bg-surface p-5">
        <EstimatePanel
          config={config}
          hours={hours}
          participants={validPeople ? participants : 0}
          packageId={packageId}
          onPackageChange={setPackageId}
          locale={locale}
        />
      </div>
    </div>
  );
}
