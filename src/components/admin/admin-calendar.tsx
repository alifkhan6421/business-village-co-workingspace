"use client";
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { EventInput } from "@fullcalendar/core";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminCalendarEvents, type CalendarEvent } from "@/lib/admin/bookings";
import type { CalendarSettings } from "@/components/calendar/base-calendar";
import { berlinDateTimeParts } from "@/lib/berlin-parts";

const BaseCalendar = dynamic(() => import("@/components/calendar/base-calendar").then((m) => m.BaseCalendar), {
  ssr: false,
  loading: () => <Skeleton className="h-[640px] w-full" />,
});

export type ResourceOption = { id: string; type: "workspace" | "room"; name: string; capacity: number };

const COLORS: Record<string, string> = {
  confirmed: "#1f6f5c",
  pending: "#b45309",
  completed: "#64748b",
  cancelled: "#dc2626",
  no_show: "#7c3aed",
};

export function toEventInput(e: CalendarEvent, guestLabel: string): EventInput {
  if (e.kind === "block") {
    return { id: `block-${e.id}`, title: e.title, start: e.start, end: e.end, display: "block", backgroundColor: "#9ca3af", borderColor: "#6b7280", textColor: "#111827", extendedProps: { kind: "block" } };
  }
  const color = COLORS[e.status ?? "confirmed"] ?? "#1f6f5c";
  return {
    id: e.id,
    title: `${e.reference} · ${e.title}${e.customer === "guest" ? ` (${guestLabel})` : ""}`,
    start: e.start,
    end: e.end,
    backgroundColor: e.customer === "guest" ? "#ffffff" : color,
    borderColor: color,
    textColor: e.customer === "guest" ? color : "#ffffff",
    classNames: e.status === "cancelled" ? ["line-through", "opacity-60"] : [],
    extendedProps: { kind: "booking" },
  };
}

export function AdminCalendar({ resources, settings }: { resources: ResourceOption[]; settings: CalendarSettings }) {
  const t = useTranslations("admin.calendar");
  const tb = useTranslations("admin.bookings");
  const ts = useTranslations("status.booking");
  const tc = useTranslations("errors");
  const locale = useLocale() as "de" | "en";
  const router = useRouter();
  const [scope, setScope] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [status, setStatus] = useState("active");
  const [blocks, setBlocks] = useState(true);

  const filter = useMemo(() => {
    const [kind, id] = scope.split(":");
    return {
      type: kind === "workspace" || kind === "room" ? kind : undefined,
      resourceId: id || undefined,
      customer,
      statuses: status === "active" ? ["pending", "confirmed", "completed"] : status === "all" ? [] : [status],
      blocks,
    };
  }, [scope, customer, status, blocks]);

  const fetchEvents = useCallback(
    async (start: Date, end: Date) => {
      const res = await adminCalendarEvents(start.toISOString(), end.toISOString(), filter);
      if (!res.ok) throw new Error(res.error);
      return (res.data ?? []).map((e) => toEventInput(e, tb("guest")));
    },
    [filter, tb],
  );
  const selected = resources.find((r) => r.id === filter.resourceId);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <NativeSelect value={scope} onChange={(e) => setScope(e.target.value)} aria-label={t("allResources")} data-testid="cal-scope">
          <option value="all">{t("allResources")}</option>
          <option value="workspace">{t("allWorkspaces")}</option>
          <option value="room">{t("allRooms")}</option>
          <optgroup label={t("allWorkspaces")}>
            {resources.filter((r) => r.type === "workspace").map((r) => (
              <option key={r.id} value={`workspace:${r.id}`}>{r.name}</option>
            ))}
          </optgroup>
          <optgroup label={t("allRooms")}>
            {resources.filter((r) => r.type === "room").map((r) => (
              <option key={r.id} value={`room:${r.id}`}>{r.name}</option>
            ))}
          </optgroup>
        </NativeSelect>
        <NativeSelect value={customer} onChange={(e) => setCustomer(e.target.value)} aria-label={t("customers")}>
          <option value="all">{t("customers")}</option>
          <option value="member">{t("members")}</option>
          <option value="guest">{t("guests")}</option>
        </NativeSelect>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("statuses")}>
          <option value="active">{t("activeOnly")}</option>
          <option value="all">{t("allStatuses")}</option>
          {["pending", "confirmed", "completed", "cancelled", "no_show"].map((s) => (
            <option key={s} value={s}>{ts(s)}</option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} className="h-4 w-4 accent-primary" />
          {t("blocks")}
        </label>
      </div>
      <p className="text-sm text-muted-foreground">{selected ? t("selectHint", { name: selected.name }) : t("newBookingHint")}</p>
      <div className="rounded-xl border bg-background p-2 sm:p-4">
        <BaseCalendar
          locale={locale}
          settings={settings}
          fetchEvents={fetchEvents}
          selectable={!!selected}
          allowPast
          onSelect={(start, end) => {
            if (!selected) return;
            const s = berlinDateTimeParts(start);
            const e = berlinDateTimeParts(end);
            router.push(`/${locale}/admin/bookings/new?type=${selected.type}&resource=${selected.id}&date=${s.date}&start=${s.time}&end=${e.time}`);
          }}
          onEventClick={(id, ext) => {
            if (ext.kind === "booking") router.push(`/${locale}/admin/bookings/${id}`);
          }}
          onError={() => toast.error(tc("unknown"))}
          height={720}
        />
      </div>
    </div>
  );
}
