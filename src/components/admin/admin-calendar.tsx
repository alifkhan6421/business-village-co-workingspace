"use client";
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { EventInput } from "@fullcalendar/core";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminCalendarEvents, type CalendarEvent } from "@/lib/admin/bookings";
import type { CalendarSettings } from "@/components/calendar/base-calendar";
import { berlinDateTimeParts } from "@/lib/berlin-parts";

const BaseCalendar = dynamic(() => import("@/components/calendar/base-calendar").then((m) => m.BaseCalendar), {
  ssr: false,
  loading: () => <Skeleton className="h-[640px] w-full" />,
});

export type ResourceOption = { id: string; type: "workspace" | "room"; name: string; capacity: number };

/** One colour per space so rooms are easy to tell apart; status is shown by style. */
export const RESOURCE_PALETTE = ["#1f6f5c", "#2563eb", "#c2410c", "#7c3aed", "#0e7490", "#be185d", "#4d7c0f", "#b45309", "#4338ca", "#0f766e", "#9f1239", "#475569"];

export function toEventInput(e: CalendarEvent, guestLabel: string, color = "#1f6f5c"): EventInput {
  if (e.kind === "block") {
    return { id: `block-${e.id}`, title: e.title, start: e.start, end: e.end, display: "block", backgroundColor: "#e5e7eb", borderColor: "#9ca3af", textColor: "#374151", classNames: ["bv-event-block"], extendedProps: { kind: "block" } };
  }
  const pending = e.status === "pending";
  return {
    id: e.id,
    title: `${e.title}${e.customer === "guest" ? ` (${guestLabel})` : ""}`,
    start: e.start,
    end: e.end,
    backgroundColor: pending ? "#ffffff" : color,
    borderColor: color,
    textColor: pending ? color : "#ffffff",
    classNames: [e.status === "cancelled" ? "line-through opacity-50" : "", pending ? "border-dashed" : ""].filter(Boolean),
    extendedProps: { kind: "booking", event: e },
  };
}

export function AdminCalendar({ resources, settings }: { resources: ResourceOption[]; settings: CalendarSettings }) {
  const t = useTranslations("admin.calendar");
  const tb = useTranslations("admin.bookings");
  const ts = useTranslations("status");
  const tc = useTranslations("errors");
  const tcommon = useTranslations("common");
  const locale = useLocale() as "de" | "en";
  const router = useRouter();
  const [scope, setScope] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [status, setStatus] = useState("active");
  const [blocks, setBlocks] = useState(true);
  const [open, setOpen] = useState<CalendarEvent | null>(null);

  const colorOf = useMemo(() => {
    const m = new Map(resources.map((r, i) => [r.id, RESOURCE_PALETTE[i % RESOURCE_PALETTE.length]]));
    return (id: string) => m.get(id) ?? RESOURCE_PALETTE[0];
  }, [resources]);

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
      return (res.data ?? []).map((e) => toEventInput(e, tb("guest"), colorOf(e.resourceId)));
    },
    [filter, tb, colorOf],
  );
  const selected = resources.find((r) => r.id === filter.resourceId);
  const legend = resources.filter((r) => (selected ? r.id === selected.id : !filter.type || r.type === filter.type));
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
        <NativeSelect value={scope} onChange={(e) => setScope(e.target.value)} aria-label={t("allResources")} data-testid="cal-scope" className="col-span-2 lg:col-span-1">
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
            <option key={s} value={s}>{ts(`booking.${s}`)}</option>
          ))}
        </NativeSelect>
        <label className="col-span-2 flex items-center gap-2 text-sm lg:col-span-1">
          <input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} className="h-4 w-4 accent-primary" />
          {t("blocks")}
        </label>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label={t("legend")}>
        {legend.map((r) => (
          <li key={r.id} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf(r.id) }} aria-hidden="true" />
            {r.name}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-dashed border-foreground/50" aria-hidden="true" />
          {ts("booking.pending")}
        </li>
        {blocks ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-300" aria-hidden="true" />
            {t("blocks")}
          </li>
        ) : null}
      </ul>
      {selected ? <p className="text-sm text-muted-foreground">{t("selectHint", { name: selected.name })}</p> : null}
      <BaseCalendar
        locale={locale}
        settings={settings}
        fetchEvents={fetchEvents}
        selectable
        allowPast
        onSelect={(start, end) => {
          const s = berlinDateTimeParts(start);
          const e = berlinDateTimeParts(end);
          const q = new URLSearchParams({ date: s.date, start: s.time, end: e.time });
          if (selected) {
            q.set("type", selected.type);
            q.set("resource", selected.id);
          } else if (filter.type) q.set("type", filter.type);
          router.push(`/${locale}/admin/bookings/new?${q}`);
        }}
        onEventClick={(_, ext) => {
          if (ext.kind === "booking" && ext.event) setOpen(ext.event as CalendarEvent);
        }}
        onError={() => toast.error(tc("unknown"))}
        height={720}
      />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" closeLabel={tcommon("close")} className="max-w-md" data-testid="booking-panel">
          {open ? (
            <>
              <div className="pr-8">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colorOf(open.resourceId) }} aria-hidden="true" />
                  <SheetTitle className="truncate text-lg font-bold">{open.resourceName}</SheetTitle>
                </div>
                <p className="mt-1 font-mono text-sm text-muted-foreground">{open.reference}</p>
              </div>
              <dl className="divide-y rounded-xl border text-sm">
                {[
                  [tb("customer"), open.customerName],
                  [t("start"), fmt(open.start)],
                  [t("end"), fmt(open.end)],
                  [tb("statusLabel"), <StatusBadge key="s" kind="booking" value={open.status ?? "confirmed"} />],
                  [tb("source"), ts.has(`source.${open.source}`) ? ts(`source.${open.source}`) : open.source],
                  [tb("customerType"), open.customer === "member" ? tb("member") : tb("guest")],
                  [tb("email"), open.email ? <a key="e" href={`mailto:${open.email}`} className="break-all text-primary hover:underline">{open.email}</a> : "–"],
                  [tb("phone"), open.phone ? <a key="p" href={`tel:${open.phone}`} className="text-primary hover:underline">{open.phone}</a> : "–"],
                ].map(([k, v], i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <Link href={`/${locale}/admin/bookings/${open.id}`} className={buttonVariants({ className: "w-full" })} data-testid="open-booking">
                {t("openBooking")}
              </Link>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
