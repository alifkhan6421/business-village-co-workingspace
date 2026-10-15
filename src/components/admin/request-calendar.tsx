"use client";
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { EventInput } from "@fullcalendar/core";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { requestCalendarEvents } from "@/lib/admin/requests";
import type { CalendarSettings } from "@/components/calendar/base-calendar";

const BaseCalendar = dynamic(() => import("@/components/calendar/base-calendar").then((m) => m.BaseCalendar), {
  ssr: false,
  loading: () => <Skeleton className="h-[640px] w-full" />,
});

const COLORS: Record<string, string> = {
  pending: "#b45309",
  under_review: "#2563eb",
  alternative_proposed: "#7c3aed",
  confirmed: "#1f6f5c",
  rejected: "#9f1239",
  cancelled: "#9f1239",
  completed: "#475569",
};
const FILTERS: Record<string, string[]> = {
  open: ["pending", "under_review", "alternative_proposed"],
  active: ["pending", "under_review", "alternative_proposed", "confirmed"],
  confirmed: ["confirmed", "completed"],
  all: [],
};

/** Month / week / day view of booking requests by requested (or adjusted) time. */
export function RequestCalendar({ settings }: { settings: CalendarSettings }) {
  const t = useTranslations("admin.requests");
  const ts = useTranslations("status.request");
  const te = useTranslations("errors");
  const locale = useLocale() as "de" | "en";
  const router = useRouter();
  const [filter, setFilter] = useState("active");

  const fetchEvents = useCallback(
    async (from: Date, to: Date): Promise<EventInput[]> => {
      const res = await requestCalendarEvents(from.toISOString(), to.toISOString(), FILTERS[filter] ?? []);
      if (!res.ok) {
        toast.error(te("unknown"));
        return [];
      }
      return (res.data ?? []).map((e) => {
        const color = COLORS[e.status] ?? "#475569";
        const open = ["pending", "under_review", "alternative_proposed"].includes(e.status);
        return {
          id: e.id,
          title: `${e.reference} · ${e.title}${e.resourceName ? ` · ${e.resourceName}` : ""}`,
          start: e.start,
          end: e.end,
          backgroundColor: open ? "#ffffff" : color,
          borderColor: color,
          textColor: open ? color : "#ffffff",
          classNames: [open ? "border-dashed" : "", e.status === "cancelled" || e.status === "rejected" ? "line-through opacity-50" : ""].filter(Boolean),
          extendedProps: { status: e.status },
        };
      });
    },
    [filter, te],
  );

  return (
    <div className="space-y-4" data-testid="request-calendar">
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("calendarFilter")} className="sm:w-64">
          {Object.keys(FILTERS).map((k) => (
            <option key={k} value={k}>{t(`calendarFilters.${k}`)}</option>
          ))}
        </NativeSelect>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {Object.entries(COLORS)
            .filter(([k]) => k !== "cancelled")
            .map(([k, c]) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded" style={{ background: c }} /> {ts(k)}
              </li>
            ))}
        </ul>
      </div>
      <div className="rounded-2xl border bg-card p-3 shadow-xs sm:p-4">
        <BaseCalendar
          key={filter}
          locale={locale}
          settings={settings}
          fetchEvents={fetchEvents}
          allowPast
          initialView="timeGridWeek"
          onEventClick={(id) => router.push(`/${locale}/admin/requests/${id}`)}
        />
      </div>
    </div>
  );
}
