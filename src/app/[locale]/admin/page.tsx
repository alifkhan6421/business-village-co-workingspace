import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarCheck2, Inbox, Monitor, UserRound, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOOKING_SELECT, customerOf, resourceName, type AdminBooking } from "@/lib/admin/queries";
import { formatBookingRange } from "@/lib/format-range";
import { berlinToUtc, todayBerlin } from "@/lib/time";
import type { Locale } from "@/i18n/routing";

function Stat({ label, value, sub, icon: Icon, href }: { label: string; value: string | number; sub?: string; icon: React.ComponentType<{ className?: string }>; href?: string }) {
  const body = (
    <Card className="h-full transition-colors hover:border-primary/40">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Bar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export default async function AdminDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const [t, ta, f] = await Promise.all([
    getTranslations({ locale, namespace: "admin.dashboard" }),
    getTranslations({ locale, namespace: "admin.activity" }),
    getFormatter({ locale }),
  ]);
  const supabase = await createClient();
  const today = todayBerlin();
  const dayStart = berlinToUtc(today, "00:00")!;
  const dayEnd = berlinToUtc(today, "24:00")!;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const active = ["pending", "confirmed", "completed"];

  const [members, todays, guestCount, upcoming, util, inquiries, activity, wsTotal, roomTotal, busyNow] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "member"),
    supabase.from("bookings").select(BOOKING_SELECT).in("status", active).lt("start_at", dayEnd.toISOString()).gt("end_at", dayStart.toISOString()).order("start_at"),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("source", "guest").gte("created_at", monthAgo.toISOString()),
    supabase.from("bookings").select(BOOKING_SELECT).in("status", ["pending", "confirmed"]).gte("start_at", dayEnd.toISOString()).order("start_at").limit(8),
    supabase.rpc("admin_utilization", { p_from: weekAgo.toISOString(), p_to: now.toISOString() }),
    supabase.from("contact_requests").select("id, name, email, created_at, message").eq("status", "new").order("created_at", { ascending: false }).limit(5),
    supabase.from("audit_logs").select("id, action, actor_label, created_at, metadata").order("created_at", { ascending: false }).limit(8),
    supabase.from("workspaces").select("id", { count: "exact", head: true }).eq("status", "available"),
    supabase.from("rooms").select("id", { count: "exact", head: true }).eq("status", "available"),
    supabase.from("bookings").select("workspace_id, room_id").in("status", ["pending", "confirmed"]).lte("start_at", now.toISOString()).gt("end_at", now.toISOString()),
  ]);
  const { data: blockedNow } = await supabase.from("resource_blocks").select("workspace_id, room_id").lte("start_at", now.toISOString()).gt("end_at", now.toISOString());
  const busy = new Set([...(busyNow.data ?? []), ...(blockedNow ?? [])].map((b) => b.workspace_id ?? b.room_id));
  const totalSpaces = (wsTotal.count ?? 0) + (roomTotal.count ?? 0);
  const availableNow = Math.max(0, totalSpaces - busy.size);

  const utilRows = (util.data ?? []) as { resource_type: string; booked_hours: number; bookable_hours: number }[];
  const pct = (type: string) => {
    const r = utilRows.find((u) => u.resource_type === type);
    return r && Number(r.bookable_hours) > 0 ? Math.round((Number(r.booked_hours) / Number(r.bookable_hours)) * 100) : 0;
  };
  const base = `/${locale}/admin`;
  const todayList = (todays.data ?? []) as unknown as AdminBooking[];
  const upcomingList = (upcoming.data ?? []) as unknown as AdminBooking[];

  const BookingList = ({ items, empty }: { items: AdminBooking[]; empty: string }) =>
    items.length === 0 ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ul className="divide-y">
        {items.map((b) => {
          const c = customerOf(b);
          return (
            <li key={b.id}>
              <Link href={`${base}/bookings/${b.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm hover:bg-muted/40">
                <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{b.booking_reference}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{resourceName(b)}</span> · {c.name}
                  <span className="block text-xs text-muted-foreground">{formatBookingRange(f, b.start_at, b.end_at)}</span>
                </span>
                <StatusBadge kind="booking" value={b.status} />
              </Link>
            </li>
          );
        })}
      </ul>
    );

  return (
    <>
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("totalMembers")} value={members.count ?? 0} icon={Users} href={`${base}/users`} />
        <Stat label={t("todaysBookings")} value={todayList.length} icon={CalendarCheck2} href={`${base}/calendar`} />
        <Stat label={t("guestBookings")} value={guestCount.count ?? 0} icon={UserRound} href={`${base}/bookings?customer=guest`} />
        <Stat label={t("availableSpaces")} value={availableNow} sub={t("ofSpaces", { total: totalSpaces })} icon={Monitor} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("todayList")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingList items={todayList} empty={t("noToday")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("utilization")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Bar label={t("workspaceUtilization")} pct={pct("workspace")} />
            <Bar label={t("roomUtilization")} pct={pct("room")} />
            <div className="flex items-center gap-2 pt-2 text-sm">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <Link href={`${base}/inquiries?status=new`} className="hover:underline">
                {t("newInquiries")}: <strong>{inquiries.data?.length ?? 0}</strong>
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("upcomingList")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingList items={upcomingList} empty={t("noUpcoming")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("inquiriesList")}</CardTitle>
          </CardHeader>
          <CardContent>
            {(inquiries.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noInquiries")}</p>
            ) : (
              <ul className="divide-y">
                {(inquiries.data ?? []).map((i) => (
                  <li key={i.id}>
                    <Link href={`${base}/inquiries/${i.id}`} className="block py-2 text-sm hover:bg-muted/40">
                      <span className="font-medium">{i.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{i.message}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">{t("recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {(activity.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {(activity.data ?? []).map((a) => {
                  const meta = (a.metadata ?? {}) as Record<string, unknown>;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 py-2">
                      <span className="w-36 shrink-0 text-xs text-muted-foreground">{f.dateTime(new Date(a.created_at), "dateTime")}</span>
                      <span className="font-medium">{ta.has(`actions.${a.action}`) ? ta(`actions.${a.action}`) : a.action}</span>
                      <span className="text-muted-foreground">{String(meta.label ?? meta.reference ?? "")}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{a.actor_label === "guest" ? ta("guestActor") : a.actor_label ?? ta("system")}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
