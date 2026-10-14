"use client";
import { useTranslations } from "next-intl";
import { Building2, DoorStairwell, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRICING_CATEGORIES, type PricingCategory, type PricingConfig } from "@/lib/pricing/calc";

const ICONS = { meeting: Presentation, stairs: DoorStairwell, venue: Building2 } as const;

/** Categories that have at least one active price, in display order. */
export function activeCategories(config: PricingConfig) {
  return PRICING_CATEGORIES.filter((c) => config.packages.some((p) => p.active && p.category === c));
}

/** "What would you like to book?": meeting room, event stairs or the entire venue. */
export function CategoryPicker({
  config,
  value,
  onChange,
  className,
}: {
  config: PricingConfig;
  value: PricingCategory;
  onChange: (c: PricingCategory) => void;
  className?: string;
}) {
  const t = useTranslations("pricing");
  const categories = activeCategories(config);
  if (categories.length < 2) return null;
  return (
    <fieldset className={className} data-testid="category-picker">
      <legend className="mb-2 text-sm font-medium">{t("whatToBook")}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {categories.map((c) => {
          const Icon = ICONS[c];
          return (
            <label
              key={c}
              data-testid={`category-${c}`}
              className={cn(
                "flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border bg-background p-3 text-sm transition-colors hover:border-foreground/20 sm:flex-col sm:items-start sm:gap-2 sm:p-4",
                "has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              )}
            >
              <input type="radio" name="pricing-what" value={c} checked={c === value} onChange={() => onChange(c)} className="sr-only" />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-snug">{t(`categories.${c}`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`categoryHints.${c}`)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
