import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { TIME_ZONE } from "@/lib/tz";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "2026-10-05" + "09:30" in Europe/Berlin → Date (UTC instant). */
export function berlinToUtc(date: string, time: string): Date | null {
  if (!DATE_RE.test(date) || !(TIME_RE.test(time) || time === "24:00")) return null;
  if (time === "24:00") {
    const d = fromZonedTime(`${date}T00:00:00`, TIME_ZONE);
    return new Date(d.getTime() + 24 * 3600 * 1000);
  }
  const d = fromZonedTime(`${date}T${time}:00`, TIME_ZONE);
  return isNaN(d.getTime()) ? null : d;
}

export function todayBerlin(): string {
  return formatInTimeZone(new Date(), TIME_ZONE, "yyyy-MM-dd");
}

export function berlinDate(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TIME_ZONE, "yyyy-MM-dd");
}

export function berlinTime(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TIME_ZONE, "HH:mm");
}

export { TIME_ZONE };
