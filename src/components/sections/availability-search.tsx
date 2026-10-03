"use client";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

export function AvailabilitySearch({ title, subtitle, times, today }: { title: string; subtitle: string; times: string[]; today: string }) {
  const t = useTranslations("site");
  const locale = useLocale() as Locale;
  return (
    <section className="mx-auto -mt-4 max-w-7xl px-4 sm:px-6" data-testid="availability-search">
      <form action={localizeHref("/search", locale)} method="get" className="rounded-2xl border bg-card p-5 shadow-lg sm:p-6">
        {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
        {subtitle ? <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <label className="space-y-1 text-sm lg:col-span-1">
            <span className="font-medium">{t("workspaceType")}</span>
            <NativeSelect name="type" defaultValue="workspace">
              <option value="workspace">{t("typeWorkspace")}</option>
              <option value="room">{t("typeRoom")}</option>
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t("dateLabel")}</span>
            <Input type="date" name="date" required min={today} defaultValue={today} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t("fromLabel")}</span>
            <NativeSelect name="start" defaultValue={times.includes("09:00") ? "09:00" : times[0]}>
              {times.slice(0, -1).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t("toLabel")}</span>
            <NativeSelect name="end" defaultValue={times.includes("17:00") ? "17:00" : times[times.length - 1]}>
              {times.slice(1).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t("numberOfPeople")}</span>
            <Input type="number" name="people" min={1} max={500} defaultValue={1} />
          </label>
          <Button type="submit" size="lg" className="h-10">
            <Search /> {t("checkAvailability")}
          </Button>
        </div>
      </form>
    </section>
  );
}
