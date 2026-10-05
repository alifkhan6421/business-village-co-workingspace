"use client";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function AvailabilitySearch({ title, subtitle, times, today, overlap = false }: { title: string; subtitle: string; times: string[]; today: string; overlap?: boolean }) {
  const t = useTranslations("site");
  const locale = useLocale() as Locale;
  return (
    <section className={cn("relative z-10 mx-auto max-w-6xl px-4 sm:px-10", overlap ? "-mt-24 sm:-mt-28" : "py-10")} data-testid="availability-search">
      <form action={localizeHref("/search", locale)} method="get" className="rounded-2xl border bg-card p-5 shadow-xl sm:p-6">
        {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
        {subtitle ? <p className="mb-4 mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.5fr_1.3fr_1fr_1fr_0.8fr_auto] lg:items-end">
          <label className="block min-w-0 space-y-1 text-sm col-span-2 lg:col-span-1">
            <span className="text-xs font-semibold text-muted-foreground">{t("workspaceType")}</span>
            <NativeSelect name="type" defaultValue="workspace">
              <option value="workspace">{t("typeWorkspace")}</option>
              <option value="room">{t("typeRoom")}</option>
            </NativeSelect>
          </label>
          <label className="block min-w-0 space-y-1 text-sm col-span-2 lg:col-span-1">
            <span className="text-xs font-semibold text-muted-foreground">{t("dateLabel")}</span>
            <Input type="date" name="date" required min={today} defaultValue={today} />
          </label>
          <label className="block min-w-0 space-y-1 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{t("fromLabel")}</span>
            <NativeSelect name="start" defaultValue={times.includes("09:00") ? "09:00" : times[0]}>
              {times.slice(0, -1).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="block min-w-0 space-y-1 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{t("toLabel")}</span>
            <NativeSelect name="end" defaultValue={times.includes("17:00") ? "17:00" : times[times.length - 1]}>
              {times.slice(1).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="block min-w-0 space-y-1 text-sm col-span-2 lg:col-span-1">
            <span className="text-xs font-semibold text-muted-foreground">{t("numberOfPeople")}</span>
            <Input type="number" name="people" min={1} max={500} defaultValue={1} />
          </label>
          <Button type="submit" size="lg" className="col-span-2 h-11 lg:col-span-1 lg:h-10">
            <Search /> {t("checkAvailability")}
          </Button>
        </div>
      </form>
    </section>
  );
}
