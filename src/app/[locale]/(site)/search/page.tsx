import { redirect } from "next/navigation";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> };

/**
 * The old homepage availability search. Availability is no longer public, so
 * existing links open the booking request form with the same details.
 */
export default async function SearchPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const q = await searchParams;
  const out = new URLSearchParams();
  if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) out.set("date", q.date);
  if (q.start && /^\d{2}:\d{2}$/.test(q.start)) {
    out.set("start", q.start);
    if (q.end && /^\d{2}:\d{2}$/.test(q.end)) {
      const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
      const hours = Math.round((mins(q.end) - mins(q.start)) / 60);
      if (hours > 0) out.set("hours", String(hours));
    }
  }
  if (q.people && /^\d{1,4}$/.test(q.people)) out.set("people", q.people);
  const query = out.toString();
  redirect(localizeHref("/booking-request", locale) + (query ? `?${query}` : ""));
}
