"use client";
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { EventInput } from "@fullcalendar/core";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { requestCalendarEvents } from "@/lib/admin/booking-requests";
import { adminCalendarEvents } from "@/lib/admin/bookings";
import type { CalendarSettings } from "@/components/calendar/base-calendar";

const BaseCalendar = dynamic(() => import("@/components/calendar/base-calendar").then((m) => m.BaseCalendar), {
  ssr: false,
  loading: () => <Skeleton className="h-[640px] w-full" />,
});

/** Request colours by status; booked rooms are shown in grey for context. */
export const REQUEST_COLORS: Record<string, string> = {
  pending: "#b45309",
  under_review: "#2563eb",
  alternative_proposed: "#7c3aed",
  confirmed: "#1f6f5c",
  rejected: "#9f1239",
  cancelled: "#64748b",
  completed: "#475569",
};

export const PARTICIPANT_RANGES: Record<string, [number, number | undefined]> = {
  "1-10": [1, 10],
  "11-20": [11, 20],
  "21-40": [21, 40],
  "41+": [41, undefined],
};

export function RequestCalendar({ rooms, settings }: { rooms: { id: string; name: string }[]; settings: CalendarSettings }) {
  const t = useTranslations("admin.requests");
  const ts = useTranslations("status.request");
  const te = useTranslations("errors");
  const locale = useLocale() as "de" | "en";
  const router = useRouter();
  const [status, setStatus] = useState("open");
  const [room, setRoom] = useState("");
  const [size, setSize] = useState("");
  const [showBookings, setShowBookings] = useState(true);

  const filter = useMemo(() => {
    const [min, max] = PARTICIPANT_RANGES[size] ?? [undefined, undefined];
    return {
      statuses: status === "open" ? ["pending", "under_review", "alternative_proposed"] : status === "all" ? [] : [status],
      roomId: room || undefined,
      minParticipants: min,
      maxParticipants: max,
    };
  }, [status, room, size]);

  const fetchEvents = useCallback(
    async (start: Date, end: Date): Promise<EventInput[]> => {
      const [req, booked] = await Promise.all([
        requestCalendarEvents(start.toISOString(), end.toISOString(), filter),
        showBookings
          ? adminCalendarEvents(start.toISOString(), end.toISOString(), { type: "room", resourceId: filter.roomId, customer: "all", statuses: ["pending", "confirmed"], blocks: true })
          : Promise.resolve({ ok: true as const, data: [] }),
      ]);
      if (!req.ok) throw new Error(req.error);
      const events: EventInput[] = (req.data ?? [])
        // Confirmed requests already appear as bookings when those are shown.
        .filter((r) => !(showBookings && r.status === "confirmed"))
        .map((r) => {
          const color = REQUEST_COLORS[r.status] ?? "#475569";
          const open = ["pending", "under_review", "alternative_proposed"].includes(r.status);
          return {
            id: `req-${r.id}`,
            title: `${r.reference} · ${r.name} · ${r.participants} P.${r.roomName ? ` · ${r.roomName}` : ""}`,
            start: r.start,
            end: r.end,
            backgroundColor: open ? "#ffffff" : color,
            borderColor: color,
            textColor: open ? color : "#ffffff",
            classNames: [open ? "border-dashed" : "", r.status === "cancelled" || r.status === "rejected" ? "line-through opacity-60" : ""].filter(Boolean),
            extendedProps: { kind: "request", id: r.id },
          };
        });
      if (booked.ok) {
        for (const b of booked.data ?? []) {
          events.push({
            id: `bk-${b.id}`,
            title: b.kind === "block" ? b.title : `${t("booked")}: ${b.title}`,
            start: b.start,
            end: b.end,
            backgroundColor: "#e5e7eb",
            borderColor: "#9ca3af",
            textColor: "#374151",
            extendedProps: { kind: b.kind === "block" ? "block" : "booking", id: b.id },
          });
        }
      }
      return events;
    },
    [filter, showBookings, t],
  );

  return (
    <div className="space-y-4" data-testid="request-calendar">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("status")}>
          <option value="open">{t("openOnly")}</option>
          <option value="all">{t("allStatuses")}</option>
          {Object.keys(REQUEST_COLORS).map((s) => (
            <option key={s} value={s}>{ts(s)}</option>
          ))}
        </NativeSelect>
        <NativeSelect value={room} onChange={(e) => setRoom(e.target.value)} aria-label={t("room")}>
          <option value="">{t("allRooms")}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </NativeSelect>
        <NativeSelect value={size} onChange={(e) => setSize(e.target.value)} aria-label={t("participants")} className="col-span-2 lg:col-span-1">
          <option value="">{t("allSizes")}</option>
          {Object.keys(PARTICIPANT_RANGES).map((k) => (
            <option key={k} value={k}>{t("sizeRange", { range: k })}</option>
          ))}
        </NativeSelect>
        <label className="col-span-2 flex items-center gap-2 text-sm lg:col-span-1">
          <input type="checkbox" checked={showBookings} onChange={(e) => setShowBookings(e.target.checked)} className="h-4 w-4 accent-primary" />
          {t("showBookings")}
        </label>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label={t("legend")}>
        {Object.entries(REQUEST_COLORS).map(([s, c]) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} aria-hidden="true" />
            {ts(s)}
          </li>
        ))}
        {showBookings ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-300" aria-hidden="true" />
            {t("booked")}
          </li>
        ) : null}
      </ul>
      <BaseCalendar
        locale={locale}
        settings={settings}
        fetchEvents={fetchEvents}
        allowPast
        initialView="timeGridWeek"
        onEventClick={(_, ext) => {
          if (ext.kind === "request") router.push(`/${locale}/admin/requests/${ext.id}`);
          else if (ext.kind === "booking") router.push(`/${locale}/admin/bookings/${ext.id}`);
        }}
        onError={() => toast.error(te("unknown"))}
        height={720}
      />
    </div>
  );
}
