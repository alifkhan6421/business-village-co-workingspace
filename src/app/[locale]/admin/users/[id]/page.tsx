import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import { ProfileAdminForm, UserAccessActions } from "@/components/admin/people-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BOOKING_SELECT, resourceName, type AdminBooking } from "@/lib/admin/queries";
import { formatBookingRange } from "@/lib/format-range";
import type { Locale } from "@/i18n/routing";

export default async function UserDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [t, f, me, auth, bookings] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getFormatter({ locale }),
    getCurrentUser(),
    createAdminClient().auth.admin.getUserById(id),
    supabase.from("bookings").select(BOOKING_SELECT).eq("user_id", id).order("start_at", { ascending: false }).limit(50),
  ]);
  const u = auth.data.user;
  const suspended = !!u?.banned_until && new Date(u.banned_until) > new Date();
  const name = p.full_name || p.email;
  return (
    <>
      <AdminPageHeader
        title={name}
        subtitle={p.email}
        back={{ href: `/${locale}/admin/users`, label: t("nav.users") }}
        actions={<UserAccessActions userId={p.id} name={name} role={p.role} suspended={suspended} isSelf={me?.user.id === p.id} />}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge kind="role" value={p.role} />
        <Badge variant={p.email_verified ? "success" : "warning"}>{p.email_verified ? t("users.verified") : t("users.notVerified")}</Badge>
        {suspended ? <Badge variant="danger">{t("users.deactivated")}</Badge> : null}
        <Badge variant="outline">{t("users.lastSignIn")}: {u?.last_sign_in_at ? f.dateTime(new Date(u.last_sign_in_at), "dateTime") : t("users.never")}</Badge>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("users.profile")}</CardTitle></CardHeader>
          <CardContent><ProfileAdminForm p={p} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("users.bookings")}</CardTitle></CardHeader>
          <CardContent>
            {(bookings.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
