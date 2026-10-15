"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Minus, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localizeHref } from "@/lib/href";
import { cn } from "@/lib/utils";
import { applicablePackages, hourBounds, type PricingCategory, type PricingConfig } from "@/lib/pricing/calc";
import type { Locale } from "@/i18n/routing";
import { activeCategories, CategoryPicker } from "./category-picker";
import { EstimatePanel } from "./estimate-panel";

/**
 * Public price calculator, laid out like the Business Village "Raumpreis-Kalkulator":
 * choose what to book, then the number of people and the duration; the price
 * appears at once. No account needed. Leads to the central booking request form.
 */
export function PriceCalculator({ config, maxParticipants = 500 }: { config: PricingConfig; maxParticipants?: number }) {
  const t = useTranslations("pricing");
  const locale = useLocale() as Locale;
  const [category, setCategory] = useState<PricingCategory>(activeCategories(config)[0] ?? "meeting");
  const inCategory = { ...config, packages: config.packages.filter((p) => p.category === category) };
  const bounds = hourBounds(inCategory);
  const [hours, setHours] = useState(4);
  const [people, setPeople] = useState("8");
  const [packageId, setPackageId] = useState<string | null>(null);
  const participants = Number(people);
  const validPeople = Number.isInteger(participants) && participants >= 1 && participants <= maxParticipants;
  // Flat-rate categories (stairs, entire venue) don't depend on the duration.
  const usesHours = inCategory.packages.some((p) => p.active && p.mode === "hourly_tiers");
  const h = Math.min(Math.max(hours, bounds.min), bounds.max);
  const chosen = validPeople ? (applicablePackages(config, h, participants).find((p) => p.id === packageId && p.category === category) ?? null) : null;

  const query = new URLSearchParams({ hours: String(h), people: validPeople ? String(participants) : "", category });
  if (chosen) query.set("package", chosen.id);
  const href = `${localizeHref("/booking-request", locale)}?${query.toString()}`;
  const hourOptions = Array.from({ length: bounds.max - bounds.min + 1 }, (_, i) => bounds.min + i);
  const step = (d: number) => setPeople(String(Math.min(maxParticipants, Math.max(1, (validPeople ? participants : 0) + d))));

  return (
    <div className="grid gap-6 rounded-2xl border bg-card p-5 shadow-lg sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10" data-testid="price-calculator">
      <div className="min-w-0 space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t("calculatorTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("calculatorHint")}</p>
        </div>

        <CategoryPicker
          config={config}
          value={category}
          onChange={(c) => {
            setCategory(c);
            setPackageId(null);
          }}
        />

        <div>
          <label htmlFor="calc-people" className="mb-2 block text-sm font-medium">{t("participants")}</label>
          <div className="flex items-stretch gap-2">
            <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={() => step(-1)} aria-label={t("fewerPeople")} disabled={validPeople && participants <= 1}>
              <Minus />
            </Button>
            <input
              id="calc-people"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxParticipants}
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              aria-invalid={!!people && !validPeople}
              className="h-12 w-full min-w-0 rounded-lg border bg-background text-center text-xl font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
            />
            <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={() => step(1)} aria-label={t("morePeople")}>
              <Plus />
            </Button>
          </div>
          {people && !validPeople ? <p className="mt-1.5 text-sm text-destructive">{t("participantsInvalid", { max: maxParticipants })}</p> : null}
        </div>

        {usesHours ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t("duration")}</legend>
            <div className="grid grid-cols-5 gap-2" role="radiogroup">
              {hourOptions.map((x) => (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={x === h}
                  data-testid={`hours-${x}`}
                  onClick={() => setHours(x)}
                  className={cn(
                    "h-11 rounded-lg border bg-background text-sm font-semibold tabular-nums transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    x === h && "border-primary bg-primary text-primary-foreground hover:border-primary",
                  )}
                >
                  {t("hoursShort", { count: x })}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-5 rounded-xl border bg-surface p-5">
        <EstimatePanel
          config={config}
          hours={h}
          participants={validPeople ? participants : 0}
          category={category}
          packageId={packageId}
          onPackageChange={setPackageId}
          locale={locale}
        />
        <div className="mt-auto space-y-2">
          <Button asChild size="lg" className="w-full" data-testid="calc-send-request">
            <a href={href}>
              <Send /> {t("sendRequest")}
            </a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("requestNote")}</p>
        </div>
      </div>
    </div>
  );
}
