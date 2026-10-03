import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import { GuestForm } from "@/components/admin/people-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOOKING_SELECT, resourceName, type AdminBooking } from "@/lib/admin/queries";
import { formatBookingRange } from "@/lib/format-range";
import type { Locale } from "@/i18n/routing";

export default async function GuestDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: g } = await supabase.from("guests").select("*").eq("id", id).maybeSingle();
  if (!g) notFound();
  const [t, f, bookings] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getFormatter({ locale }),
    supabase.from("bookings").select(BOOKING_SELECT).eq("guest_id", id).order("start_at", { ascending: false }),
  ]);
  return (
    <>
      <AdminPageHeader title={`${g.first_name} ${g.last_name}`} subtitle={g.email} back={{ href: `/${locale}/admin/guests`, label: t("nav.guests") }} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("guests.edit")}</CardTitle></CardHeader>
          <CardContent><GuestForm g={g} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("users.bookings")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {((bookings.data ?? []) as unknown as AdminBooking[]).map((b) => (
                <li key={b.id}>
                  <Link href={`/${locale}/admin/bookings/${b.id}`} className="flex flex-wrap items-center gap-2 py-2 hover:bg-muted/40">
                    <span className="font-mono text-xs">{b.booking_reference}</span>
                    <span className="min-w-0 flex-1">{resourceName(b)} · <span className="text-muted-foreground">{formatBookingRange(f, b.start_at, b.end_at)}</span></span>
                    <StatusBadge kind="booking" value={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
