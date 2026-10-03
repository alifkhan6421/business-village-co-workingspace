import type { DateTimeFormatOptions } from "next-intl";

type Fmt = { dateTime: (d: Date, opts?: DateTimeFormatOptions) => string };

/** "Mo., 05.10.2026 · 09:00–11:00" (date range if it spans days). Formatter carries the Berlin time zone. */
export function formatBookingRange(f: Fmt, start: string | Date, end: string | Date) {
  const s = new Date(start);
  const e = new Date(end);
  const dateOpts: DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" };
  const day = f.dateTime(s, dateOpts);
  const endDay = f.dateTime(e, dateOpts);
  const t = (d: Date) => f.dateTime(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (day === endDay) return `${day} · ${t(s)}–${t(e)}`;
  return `${day} ${t(s)} – ${endDay} ${t(e)}`;
}
