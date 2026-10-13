"use client";
import { useLocale, useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Homepage "availability_search" section: collects date, time, duration and
 * group size and opens the central booking request form with them. It never
 * shows availability.
 */
export function RequestQuickForm({ times, today, maxHours, overlap = false }: { times: string[]; today: string; maxHours: number; overlap?: boolean }) {
  const t = useTranslations("request");
  const locale = useLocale() as Locale;
  return (
    <section className={cn("relative z-10 mx-auto max-w-6xl px-4 sm:px-10", overlap ? "-mt-24 sm:-mt-28" : "py-10")} data-testid="request-quick-form">
      <form action={localizeHref("/booking-request", locale)} method="get" className="rounded-2xl border bg-card p-5 shadow-xl sm:p-6">
        <h2 className="text-base font-semibold">{t("quickTitle")}</h2>
        <p className="mb-4 mt-0.5 text-sm text-muted-foreground">{t("quickSubtitle")}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="col-span-2 block min-w-0 space-y-1 text-sm lg:col-span-1">
            <span className="text-xs font-semibold text-muted-foreground">{t("date")}</span>
            <Input type="date" name="date" min={today} defaultValue={today} />
          </label>
          <label className="block min-w-0 space-y-1 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{t("startTime")}</span>
            <NativeSelect name="start" defaultValue={times.includes("09:00") ? "09:00" : times[0]}>
              {times.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="block min-w-0 space-y-1 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{t("duration")}</span>
            <NativeSelect name="hours" defaultValue="4">
              {Array.from({ length: maxHours }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>{t("hoursOption", { count: h })}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="col-span-2 block min-w-0 space-y-1 text-sm lg:col-span-1">
            <span className="text-xs font-semibold text-muted-foreground">{t("participants")}</span>
            <Input type="number" name="people" min={1} max={1000} defaultValue={4} />
          </label>
          <Button type="submit" size="lg" className="col-span-2 h-11 lg:col-span-1 lg:h-10">
            <Send /> {t("quickButton")}
          </Button>
        </div>
      </form>
    </section>
  );
}
