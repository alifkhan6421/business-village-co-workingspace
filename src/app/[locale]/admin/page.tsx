import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, CalendarCheck2, CalendarClock, CalendarDays, Euro, Gauge, MessageSquare, Monitor, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { BOOKING_SELECT, customerOf, resourceName, type AdminBooking } from "@/lib/admin/queries";
import { formatBookingRange } from "@/lib/format-range";
import { estimatePrice, formatPrice } from "@/lib/price";
import { berlinToUtc, todayBerlin } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

type Icon = React.ComponentType<{ className?: string }>;

function Kpi({ label, value, sub, icon: Icon, href, tone = "primary" }: { label: string; value: string | number; sub?: string; icon: Icon; href?: string; tone?: "primary" | "amber" | "sky" | "violet" }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-amber-100 text-amber-700",
    sky: "bg-sky-100 text-sky-700",
    violet: "bg-violet-100 text-violet-700",
  };
  const body = (
    <div className="flex h-full flex-col justify-between gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-[box-shadow,border-color] hover:border-primary/30 hover:shadow-sm sm:p-5">
      <div className="flex min-h-10 items-start justify-between gap-2">
        <span className="pt-1 text-[13px] font-medium leading-snug text-muted-foreground">{label}</span>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums tracking-tight sm:text-[28px]">{value}</div>
        {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

function Bar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="text-foreground/80">{label}</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function SectionCard({ title, href, linkLabel, children, className }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {href ? (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
            {linkLabel} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function AdminDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const [t, ta, tn, f] = await Promise.all([
    getTranslations({ locale, namespace: "admin.dashboard" }),
    getTranslations({ locale, namespace: "admin.activity" }),
    getTranslations({ locale, namespace: "admin" }),
    getFormatter({ locale }),
  ]);
  const supabase = await createClient();
  const today = todayBerlin();
  const dayStart = berlinToUtc(today, "00:00")!;
  const dayEnd = berlinToUtc(today, "24:00")!;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const active = ["pending", "confirmed", "completed"];

  const [todays, upcoming, upcomingCount, recent, util, inquiries, activity, workspaces, rooms, busyNow, customers, revenueRows] = await Promise.all([
    supabase.from("bookings").select(BOOKING_SELECT).in("status", active).lt("start_at", dayEnd.toISOString()).gt("end_at", dayStart.toISOString()).order("start_at"),
    supabase.from("bookings").select(BOOKING_SELECT).in("status", ["pending", "confirmed"]).gte("start_at", dayEnd.toISOString()).order("start_at").limit(6),
    supabase.from("bookings").select("id", { count: "exact", head: true }).in("status", ["pending", "confirmed"]).gte("start_at", now.toISOString()).lt("start_at", weekAhead.toISOString()),
    supabase.from("bookings").select(BOOKING_SELECT).order("created_at", { ascending: false }).limit(6),
    supabase.rpc("admin_utilization", { p_from: weekAgo.toISOString(), p_to: now.toISOString() }),
    supabase.from("contact_requests").select("id, name, email, created_at, message").eq("status", "new").order("created_at", { ascending: false }).limit(5),
    supabase.from("audit_logs").select("id, action, actor_label, created_at, metadata").order("created_at", { ascending: false }).limit(6),
    // `*` so the dashboard keeps working while the price columns are missing on a database.
    supabase.from("workspaces").select("*"),
    supabase.from("rooms").select("*"),
    supabase.from("bookings").select("workspace_id, room_id").in("status", ["pending", "confirmed"]).lte("start_at", now.toISOString()).gt("end_at", now.toISOString()),
    supabase.from("bookings").select("user_id, guest_id").in("status", active).gte("end_at", monthAgo.toISOString()).limit(5000),
    supabase.from("bookings").select("workspace_id, room_id, start_at, end_at").in("status", ["confirmed", "completed"]).gte("start_at", monthAgo.toISOString()).lt("start_at", now.toISOString()).limit(5000),
  ]);
  const { data: blockedNow } = await supabase.from("resource_blocks").select("workspace_id, room_id").lte("start_at", now.toISOString()).gt("end_at", now.toISOString());

  type Res = { id: string; status: string; price_hourly?: number | string | null; price_daily?: number | string | null };
  const resources = [...((workspaces.data ?? []) as Res[]), ...((rooms.data ?? []) as Res[])];
  const bookable = resources.filter((r) => r.status === "available");
  const busy = new Set([...(busyNow.data ?? []), ...(blockedNow ?? [])].map((b) => b.workspace_id ?? b.room_id));
  const availableNow = bookable.filter((r) => !busy.has(r.id)).length;

  const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
  const prices = new Map(resources.map((r) => [r.id, { hourly: num(r.price_hourly), daily: num(r.price_daily) }]));
  const hasPrices = [...prices.values()].some((p) => p.hourly !== null || p.daily !== null);
  const revenue = (revenueRows.data ?? []).reduce((sum, b) => {
    const p = prices.get((b.workspace_id ?? b.room_id)!);
    if (!p) return sum;
    const hours = (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 3600000;
    return sum + (estimatePrice(hours, p.hourly, p.daily) ?? 0);
  }, 0);
  const activeCustomers = new Set((customers.data ?? []).map((b) => b.user_id ?? `g:${b.guest_id}`)).size;

  const utilRows = (util.data ?? []) as { resource_type: string; booked_hours: number; bookable_hours: number }[];
  const pct = (rows: typeof utilRows) => {
    const booked = rows.reduce((s, r) => s + Number(r.booked_hours), 0);
    const total = rows.reduce((s, r) => s + Number(r.bookable_hours), 0);
    return total > 0 ? Math.round((booked / total) * 100) : 0;
  };
  const base = `/${locale}/admin`;
  const todayList = (todays.data ?? []) as unknown as AdminBooking[];
  const upcomingList = (upcoming.data ?? []) as unknown as AdminBooking[];
  const recentList = (recent.data ?? []) as unknown as AdminBooking[];
  const time = (d: string) => f.dateTime(new Date(d), "time");

  const BookingList = ({ items, empty }: { items: AdminBooking[]; empty: string }) =>
    items.length === 0 ? (
      <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ul className="-mx-2 divide-y">
        {items.map((b) => {
          const c = customerOf(b);
          return (
            <li key={b.id}>
              <Link href={`${base}/bookings/${b.id}`} className="flex items-center gap-3 rounded-lg px-2 py-3 text-sm transition-colors hover:bg-surface">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {resourceName(b)} <span className="font-normal text-muted-foreground">· {c.name}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatBookingRange(f, b.start_at, b.end_at)} · <span className="font-mono">{b.booking_reference}</span>
                  </span>
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
      <AdminPageHeader
        title={t("title")}
        subtitle={f.dateTime(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={
          <>
            <Link href={`${base}/calendar`} className={buttonVariants({ variant: "outline" })}>
              <CalendarDays /> {tn("nav.calendar")}
            </Link>
            <Link href={`${base}/bookings/new`} className={buttonVariants()}>
              <Plus /> {tn("bookings.new")}
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6" data-testid="admin-kpis">
        <Kpi label={t("todaysBookings")} value={todayList.length} icon={CalendarCheck2} href={`${base}/calendar`} />
        <Kpi label={t("upcoming")} value={upcomingCount.count ?? 0} sub={t("next7Days")} icon={CalendarClock} tone="sky" href={`${base}/bookings`} />
        <Kpi label={t("activeCustomers")} value={activeCustomers} sub={t("last30Days")} icon={Users} tone="violet" href={`${base}/guests`} />
        <Kpi label={t("occupancy")} value={`${pct(utilRows)}%`} sub={t("last7Days")} icon={Gauge} tone="amber" />
        <Kpi
          label={t("revenue")}
          value={hasPrices ? formatPrice(Math.round(revenue), locale) : "–"}
          sub={hasPrices ? t("revenueSub") : t("noPrices")}
          icon={Euro}
        />
        <Kpi label={t("availableSpaces")} value={availableNow} sub={t("ofSpaces", { total: bookable.length })} icon={Monitor} tone="sky" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <SectionCard title={t("todayList")} href={`${base}/calendar`} linkLabel={tn("nav.calendar")} className="lg:col-span-2">
          {todayList.length === 0 ? (
            <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-muted-foreground">{t("noToday")}</p>
          ) : (
            <ol className="space-y-2" data-testid="today-schedule">
              {todayList.map((b) => {
                const c = customerOf(b);
                return (
                  <li key={b.id}>
                    <Link href={`${base}/bookings/${b.id}`} className="flex items-stretch gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-surface">
                      <span className="flex w-14 shrink-0 flex-col justify-center text-xs tabular-nums text-muted-foreground">
                        <span className="text-sm font-semibold text-foreground">{time(b.start_at)}</span>
                        {time(b.end_at)}
                      </span>
                      <span className={cn("w-1 shrink-0 rounded-full", b.booking_type === "room" ? "bg-sky-500" : "bg-primary")} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{resourceName(b)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.name} · {c.kind === "member" ? tn("bookings.member") : tn("bookings.guest")}
                        </span>
                      </span>
                      <span className="self-center">
                        <StatusBadge kind="booking" value={b.status} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>

        <SectionCard title={t("utilization")}>
          <div className="space-y-4">
            <Bar label={t("workspaceUtilization")} pct={pct(utilRows.filter((u) => u.resource_type === "workspace"))} />
            <Bar label={t("roomUtilization")} pct={pct(utilRows.filter((u) => u.resource_type === "room"))} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Link href={`${base}/workspaces`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {tn("nav.workspaces")}
            </Link>
            <Link href={`${base}/rooms`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {tn("nav.rooms")}
            </Link>
          </div>
        </SectionCard>

        <SectionCard title={t("upcomingList")} href={`${base}/bookings`} linkLabel={t("viewAll")} className="lg:col-span-2">
          <BookingList items={upcomingList} empty={t("noUpcoming")} />
        </SectionCard>

        <SectionCard title={t("inquiriesList")} href={`${base}/inquiries`} linkLabel={t("viewAll")}>
          {(inquiries.data ?? []).length === 0 ? (
            <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-muted-foreground">{t("noInquiries")}</p>
          ) : (
            <ul className="-mx-2 divide-y">
              {(inquiries.data ?? []).map((i) => (
                <li key={i.id}>
                  <Link href={`${base}/inquiries/${i.id}`} className="flex gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-surface">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{i.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{i.message}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={t("recentBookings")} href={`${base}/bookings?when=all`} linkLabel={t("viewAll")} className="lg:col-span-2">
          <BookingList items={recentList} empty={t("noUpcoming")} />
        </SectionCard>

        <SectionCard title={t("recentActivity")} href={`${base}/activity`} linkLabel={t("viewAll")}>
          {(activity.data ?? []).length === 0 ? (
            <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-muted-foreground">{t("noActivity")}</p>
          ) : (
            <ol className="relative space-y-4 border-l pl-4">
              {(activity.data ?? []).map((a) => {
                const meta = (a.metadata ?? {}) as Record<string, unknown>;
                return (
                  <li key={a.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary ring-4 ring-card" aria-hidden="true" />
                    <span className="block font-medium">{ta.has(`actions.${a.action}`) ? ta(`actions.${a.action}`) : a.action}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[String(meta.label ?? meta.reference ?? ""), a.actor_label === "guest" ? ta("guestActor") : a.actor_label ?? ta("system"), f.dateTime(new Date(a.created_at), "dateTime")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>
      </div>
    </>
  );
}
