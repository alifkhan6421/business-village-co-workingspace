import { TIME_ZONE } from "@/lib/tz";

/** Client-safe: Date -> { date: "2026-10-05", time: "09:30" } in Europe/Berlin. */
export function berlinDateTimeParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const time = `${get("hour")}:${get("minute")}`;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time };
}
