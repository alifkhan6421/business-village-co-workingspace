"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import deLocale from "@fullcalendar/core/locales/de";
import enLocale from "@fullcalendar/core/locales/en-gb";
import type { DateSelectArg, EventClickArg, EventInput, EventSourceFuncArg } from "@fullcalendar/core";
import { useTranslations } from "next-intl";

export type CalendarSettings = {
  dayStart: string; // "07:00"
  dayEnd: string; // "21:00"
  slotMinutes: number;
  weekdays: number[]; // ISO 1 = Monday
};

export type BaseCalendarProps = {
  locale: "de" | "en";
  settings: CalendarSettings;
  fetchEvents: (start: Date, end: Date) => Promise<EventInput[]>;
  selectable?: boolean;
  allowPast?: boolean;
  onSelect?: (start: Date, end: Date) => void;
  onEventClick?: (id: string, extended: Record<string, unknown>) => void;
  initialDate?: string;
  refreshKey?: number;
  selection?: { start: Date; end: Date } | null;
  onError?: () => void;
  height?: string | number;
};

/** Shared FullCalendar setup: Month / Week / Day, Europe/Berlin, localized. */
export function BaseCalendar(props: BaseCalendarProps) {
  const ref = useRef<FullCalendar>(null);
  const t = useTranslations("calendar");
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const api = ref.current?.getApi();
    if (!api) return;
    if (narrow && api.view.type === "timeGridWeek") api.changeView("timeGridDay");
  }, [narrow]);

  useEffect(() => {
    ref.current?.getApi().refetchEvents();
  }, [props.refreshKey]);

  const { fetchEvents, onError } = props;
  const eventSources = useMemo(
    () => [
      {
        id: "data",
        events: (info: EventSourceFuncArg, success: (e: EventInput[]) => void, failure: (e: Error) => void) => {
          fetchEvents(info.start, info.end)
            .then(success)
            .catch((e) => {
              onError?.();
              failure(e);
            });
        },
      },
    ],
    [fetchEvents, onError],
  );

  // Keep the calendar highlight in sync when the time is changed in the form.
  const selStart = props.selection?.start.getTime();
  const selEnd = props.selection?.end.getTime();
  useEffect(() => {
    const api = ref.current?.getApi();
    if (!api) return;
    if (selStart && selEnd) {
      api.gotoDate(new Date(selStart));
      api.select(new Date(selStart), new Date(selEnd));
    } else api.unselect();
  }, [selStart, selEnd]);

  const daysOfWeek = props.settings.weekdays.map((d) => d % 7);
  const businessHours = { daysOfWeek, startTime: props.settings.dayStart, endTime: props.settings.dayEnd };
  const slot = `00:${String(props.settings.slotMinutes).padStart(2, "0")}:00`.replace("00:60:00", "01:00:00");

  return (
    <div className="bv-calendar" data-testid="booking-calendar">
      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
        timeZone="Europe/Berlin"
        locales={[deLocale, enLocale]}
        locale={props.locale === "de" ? "de" : "en-gb"}
        buttonText={{ today: t("today"), month: t("month"), week: t("week"), day: t("day") }}
        allDayText={t("allDay")}
        noEventsText={t("noEvents")}
        firstDay={1}
        initialView="timeGridWeek"
        initialDate={props.initialDate}
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
        height={props.height ?? "auto"}
        allDaySlot={false}
        nowIndicator
        slotMinTime={props.settings.dayStart}
        slotMaxTime={props.settings.dayEnd}
        slotDuration={slot}
        snapDuration={slot}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        businessHours={businessHours}
        hiddenDays={[0, 6].filter((d) => !daysOfWeek.includes(d))}
        selectable={!!props.selectable}
        selectMirror
        unselectAuto={false}
        selectOverlap={false}
        selectConstraint="businessHours"
        selectLongPressDelay={150}
        selectAllow={(info) => props.allowPast || info.start.getTime() >= Date.now() - 60_000}
        select={(info: DateSelectArg) => {
          if (info.view.type === "dayGridMonth") {
            info.view.calendar.changeView("timeGridDay", info.startStr);
            info.view.calendar.unselect();
            return;
          }
          props.onSelect?.(info.start, info.end);
        }}
        dateClick={(info) => {
          if (info.view.type === "dayGridMonth") info.view.calendar.changeView("timeGridDay", info.dateStr);
        }}
        eventClick={(info: EventClickArg) => {
          if (info.event.id) props.onEventClick?.(info.event.id, info.event.extendedProps);
        }}
        eventSources={eventSources}
        dayMaxEvents={3}
      />
    </div>
  );
}
