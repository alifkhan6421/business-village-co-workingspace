"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { applicableEstimates, optionName, type PricingConfig } from "@/lib/pricing/calc";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";
import { EstimateSummary } from "./estimate-summary";

export function clampInt(value: string, min: number, max: number) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/**
 * Public price calculator: duration, participants and (where several apply)
 * the pricing category. No login needed; the button carries the inputs over
 * to the central booking request form.
 */
export function PriceCalculator({ config, maxHours }: { config: PricingConfig; maxHours: number }) {
  const t = useTranslations("pricing");
  const tv = useTranslations("validation");
  const locale = useLocale() as Locale;
  const [hoursRaw, setHoursRaw] = useState("2");
  const [participantsRaw, setParticipantsRaw] = useState("6");
  const [option, setOption] = useState("");

  const hours = Number(hoursRaw);
  const participants = Number(participantsRaw);
  const hoursValid = Number.isInteger(hours) && hours >= 1 && hours <= maxHours;
  const participantsValid = Number.isInteger(participants) && participants >= 1 && participants <= 1000;
  const options = useMemo(
    () => (hoursValid && participantsValid ? applicableEstimates(config, { hours, participants }) : []),
    [config, hours, participants, hoursValid, participantsValid],
  );
  const estimate = options.find((o) => o.option.key === option) ?? options[0] ?? null;

  const query = new URLSearchParams();
  if (hoursValid) query.set("hours", String(hours));
  if (participantsValid) query.set("participants", String(participants));
  if (estimate) query.set("option", estimate.option.key);
  const requestHref = `${localizeHref("/booking-request", locale)}?${query}`;

  return (
    <div className="grid gap-6 rounded-2xl border bg-card p-5 shadow-lg sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="price-calculator">
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">{t("calculatorTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("calculatorHint")}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("duration")} htmlFor="pc-hours" error={hoursValid ? undefined : t("hoursRange", { max: maxHours })}>
            <Input
              id="pc-hours"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxHours}
              step={1}
              value={hoursRaw}
              onChange={(e) => setHoursRaw(e.target.value)}
              onBlur={() => setHoursRaw(String(clampInt(hoursRaw, 1, maxHours)))}
              aria-invalid={!hoursValid}
            />
          </Field>
          <Field label={t("participants")} htmlFor="pc-participants" error={participantsValid ? undefined : tv("invalidNumber")}>
            <Input
              id="pc-participants"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              step={1}
              value={participantsRaw}
              onChange={(e) => setParticipantsRaw(e.target.value)}
              onBlur={() => setParticipantsRaw(String(clampInt(participantsRaw, 1, 1000)))}
              aria-invalid={!participantsValid}
            />
          </Field>
        </div>
        {options.length > 1 ? (
          <Field label={t("category")} htmlFor="pc-option" hint={t("categoryHint")}>
            <NativeSelect id="pc-option" value={estimate?.option.key ?? ""} onChange={(e) => setOption(e.target.value)}>
              {options.map((o) => (
                <option key={o.option.key} value={o.option.key}>
                  {optionName(o.option, locale)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </div>
      <div className="flex flex-col gap-4" aria-live="polite">
        <EstimateSummary estimate={estimate} settings={config.settings} />
        <Button asChild size="lg" className="w-full">
          <a href={requestHref} data-testid="calculator-request">
            <Send /> {t("sendRequest")}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">{t("requestNotBinding")}</p>
      </div>
    </div>
  );
}
