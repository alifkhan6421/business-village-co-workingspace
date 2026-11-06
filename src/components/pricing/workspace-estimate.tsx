"use client";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { quoteWorkspace, WORKSPACE_MAX_UNITS, WORKSPACE_UNITS, type PricingConfig, type WorkspacePrice, type WorkspaceUnit } from "@/lib/pricing/calc";
import { QuoteBreakdown } from "./estimate-panel";

/** "Per day" / "Per month" switch for workspace bookings. */
export function WorkspaceUnitPicker({ value, onChange, className }: { value: WorkspaceUnit; onChange: (u: WorkspaceUnit) => void; className?: string }) {
  const t = useTranslations("pricing.workspace");
  return (
    <fieldset className={className}>
      <legend className="mb-2 text-sm font-medium">{t("unitLegend")}</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {WORKSPACE_UNITS.map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={u === value}
            data-testid={`unit-${u}`}
            onClick={() => onChange(u)}
            className={cn(
              "h-11 rounded-lg border bg-background text-sm font-semibold transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              u === value && "border-primary bg-primary text-primary-foreground hover:border-primary",
            )}
          >
            {t(`unit.${u}`)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Number of days or months (1 … maximum) as a select. */
export function WorkspaceCountSelect({ id, unit, value, onChange }: { id: string; unit: WorkspaceUnit; value: number; onChange: (n: number) => void }) {
  const t = useTranslations("pricing.workspace");
  return (
    <select
      id={id}
      value={Math.min(value, WORKSPACE_MAX_UNITS[unit])}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="unit-count"
    >
      {Array.from({ length: WORKSPACE_MAX_UNITS[unit] }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>
          {t(`count.${unit}`, { count: n })}
        </option>
      ))}
    </select>
  );
}

/** Live price for a workspace request (per person × people × days or months). */
export function WorkspaceEstimate({
  config,
  workspaces,
  unit,
  units,
  participants,
  preferredId,
  locale,
}: {
  config: Pick<PricingConfig, "settings">;
  workspaces: WorkspacePrice[];
  unit: WorkspaceUnit;
  units: number;
  participants: number;
  preferredId?: string | null;
  locale: "de" | "en";
}) {
  const t = useTranslations("pricing");
  const quote = participants > 0 ? quoteWorkspace(workspaces, unit, units, participants, config.settings, preferredId) : null;
  const maxSeats = Math.max(0, ...workspaces.map((w) => w.capacity));
  return (
    <div className="space-y-4" data-testid="estimate-panel" aria-live="polite">
      {quote ? (
        <>
          <QuoteBreakdown quote={quote} config={config} locale={locale} />
          {quote.maxGrossCents !== null ? <p className="text-xs text-muted-foreground">{t("workspace.rangeNote")}</p> : null}
        </>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-muted px-3.5 py-3 text-sm text-muted-foreground" data-testid="no-estimate">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {participants <= 0 ? t("enterDetails") : participants > maxSeats ? t("workspace.tooMany", { count: maxSeats }) : t("workspace.noPrice")}
        </p>
      )}
    </div>
  );
}
