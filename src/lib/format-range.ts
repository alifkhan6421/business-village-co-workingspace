import type { DateTimeFormatOptions } from "next-intl";

type Fmt = { dateTime: (d: Date, opts?: DateTimeFormatOptions) => string };

/** "Mo., 05.10.2026 · 09:00–11:00" (date range if it spans days). Formatter carries the Berlin time zone. */
export function formatBookingRange(f: Fmt, start: string | Date, end: string | Date) {
  const s = new Date(start);
  const e = new Date(end);
  const dateOpts: DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
  const day = f.dateTime(s, dateOpts);
  const endDay = f.dateTime(e, dateOpts);
  const t = (d: Date) => f.dateTime(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (day === endDay) return `${day} · ${t(s)}–${t(e)}`;
  return `${day} ${t(s)} – ${endDay} ${t(e)}`;
}

/**
 * "Mo., 16. Nov. 2026 – Fr., 20. Nov. 2026" for day and month bookings, whose
 * period ends at midnight (exclusive): the last day shown is the day before.
 */
export function formatDayPeriod(f: Fmt, start: string | Date, end: string | Date) {
  const dateOpts: DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
  const first = f.dateTime(new Date(start), dateOpts);
  const last = f.dateTime(new Date(new Date(end).getTime() - 12 * 3600000), dateOpts);
  return first === last ? first : `${first} – ${last}`;
}

/** Day bookings start at midnight; true when the period is whole days (Berlin time). */
export function isWholeDays(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return e.getTime() - s.getTime() >= 20 * 3600000 && s.getUTCMinutes() === 0 && e.getUTCMinutes() === 0 && [22, 23].includes(s.getUTCHours()) && [22, 23].includes(e.getUTCHours());
}
