import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarDays, ChevronRight, List } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ListFilters, Pagination, buildHref, searchTerm } from "@/components/admin/list-tools";
import { StatusBadge } from "@/components/admin/status-badge";
import { PARTICIPANT_RANGES, RequestCalendar } from "@/components/admin/request-calendar";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { buttonVariants } from "@/components/ui/button";
import { loadCalendarSettings } from "@/lib/admin/queries";
import { formatBookingRange } from "@/lib/format-range";
import { berlinToUtc } from "@/lib/time";
import { formatCents, toCents } from "@/lib/pricing/calc";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

const PER_PAGE = 25;
const STATUSES = ["pending", "under_review", "alternative_proposed", "confirmed", "rejected", "cancelled", "completed"];
type SP = { q?: string; status?: string; room?: string; size?: string; from?: string; to?: string; when?: string; view?: string; page?: string };

const SELECT =
  "id, reference, status, start_at, end_at, duration_hours, participants, contact_name, contact_email, contact_company, estimated_gross, quote_gross, price_adjusted, created_at, assigned_room:rooms!booking_requests_assigned_room_id_fkey(name), preferred_room:rooms!booking_requests_preferred_room_id_fkey(name)";

export default async function RequestsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const [t, ts, f] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "status.request" }),
    getFormatter({ locale }),
  ]);
  const supabase = await createClient();
  const { data: rooms } = await supabase.from("rooms").select("id, name").order("name");
  const base = `/${locale}/admin/requests`;
  const calendar = sp.view === "calendar";

  const header = (
    <AdminPageHeader
      title={t("requests.title")}
      subtitle={t("requests.subtitle")}
      actions={
        <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label={t("requests.view")}>
          <Link href={base} aria-current={!calendar ? "page" : undefined} className={cn(buttonVariants({ variant: calendar ? "ghost" : "secondary", size: "sm" }))}>
            <List /> {t("requests.listView")}
          </Link>
          <Link href={`${base}?view=calendar`} aria-current={calendar ? "page" : undefined} className={cn(buttonVariants({ variant: calendar ? "secondary" : "ghost", size: "sm" }))} data-testid="requests-calendar-view">
            <CalendarDays /> {t("requests.calendarView")}
          </Link>
        </div>
      }
    />
  );

  if (calendar) {
    return (
      <>
        {header}
        <RequestCalendar rooms={rooms ?? []} settings={await loadCalendarSettings()} />
      </>
    );
  }

  const page = Math.max(1, Number(sp.page) || 1);
  const when = sp.when ?? "open";
  let query = supabase.from("booking_requests").select(SELECT, { count: "exact" });
  if (when === "open") query = query.in("status", ["pending", "under_review", "alternative_proposed"]).order("start_at", { ascending: true });
  else if (when === "upcoming") query = query.gte("end_at", new Date().toISOString()).order("start_at", { ascending: true });
  else query = query.order("created_at", { ascending: false });
  if (sp.status && STATUSES.includes(sp.status)) query = query.eq("status", sp.status);
  if (sp.room && /^[0-9a-f-]{36}$/.test(sp.room)) query = query.or(`assigned_room_id.eq.${sp.room},preferred_room_id.eq.${sp.room}`);
  const sizes = PARTICIPANT_RANGES[sp.size ?? ""];
  if (sizes) {
    query = query.gte("participants", sizes[0]);
    if (sizes[1]) query = query.lte("participants", sizes[1]);
  }
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? berlinToUtc(sp.from, "00:00") : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? berlinToUtc(sp.to, "00:00") : null;
  if (from) query = query.gte("start_at", from.toISOString());
  if (to) query = query.lt("start_at", new Date(to.getTime() + 86_400_000).toISOString());
  const term = searchTerm(sp.q);
  if (term) {
    const like = `%${term}%`;
    query = query.or(`reference.ilike.${like},contact_name.ilike.${like},contact_email.ilike.${like},contact_company.ilike.${like}`);
  }
  const { data, count } = await query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  type Row = NonNullable<typeof data>[number];
  const rows = (data ?? []) as Row[];
  const keep = { q: sp.q, status: sp.status, room: sp.room, size: sp.size, from: sp.from, to: sp.to, when };
  const roomOf = (r: Row) => (r.assigned_room as { name: string } | null)?.name ?? (r.preferred_room as { name: string } | null)?.name ?? null;
  const price = (r: Row) => {
    const v = r.quote_gross ?? r.estimated_gross;
    return v === null || v === undefined ? "—" : formatCents(toCents(v), locale);
  };

  return (
    <>
      {header}
      <ListFilters
        q={sp.q}
        placeholder={t("requests.searchPlaceholder")}
        dates={[
          { name: "from", value: sp.from, label: t("requests.from") },
          { name: "to", value: sp.to, label: t("requests.to") },
        ]}
        filters={[
          {
            name: "when",
            value: when,
            label: t("requests.show"),
            options: [
              { value: "open", label: t("requests.openOnly") },
              { value: "upcoming", label: t("bookings.upcoming") },
              { value: "all", label: t("requests.allNewest") },
            ],
          },
          {
            name: "status",
            value: sp.status ?? "all",
            label: t("common.status"),
            options: [{ value: "all", label: `${t("common.status")}: ${t("common.filterAll")}` }, ...STATUSES.map((s) => ({ value: s, label: ts(s) }))],
          },
          {
            name: "room",
            value: sp.room ?? "all",
            label: t("requests.room"),
            options: [{ value: "all", label: t("requests.allRooms") }, ...(rooms ?? []).map((r) => ({ value: r.id, label: r.name }))],
          },
          {
            name: "size",
            value: sp.size ?? "all",
            label: t("requests.participants"),
            options: [{ value: "all", label: t("requests.allSizes") }, ...Object.keys(PARTICIPANT_RANGES).map((k) => ({ value: k, label: t("requests.sizeRange", { range: k }) }))],
          },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title={t("requests.empty")} />
      ) : (
        <>
          <ul className="space-y-3 md:hidden" data-testid="request-cards">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`${base}/${r.id}`} className="block rounded-2xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.contact_name}</div>
                      <div className="truncate text-sm text-muted-foreground">{r.contact_company || r.contact_email}</div>
                    </div>
                    <StatusBadge kind="request" value={r.status} />
                  </div>
                  <div className="mt-3 text-sm">{formatBookingRange(f, r.start_at, r.end_at)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono font-semibold text-primary">{r.reference}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t("requests.peopleCount", { count: r.participants })}</span>
                    <span aria-hidden="true">·</span>
                    <span>{price(r)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Table wrapperClassName="hidden md:block" data-testid="request-table">
            <THead>
              <TR>
                <TH>{t("bookings.reference")}</TH>
                <TH>{t("common.customer")}</TH>
                <TH>{t("bookings.when")}</TH>
                <TH>{t("requests.participants")}</TH>
                <TH className="hidden lg:table-cell">{t("requests.room")}</TH>
                <TH className="text-right">{t("requests.price")}</TH>
                <TH>{t("common.status")}</TH>
                <TH className="hidden xl:table-cell">{t("bookings.created")}</TH>
                <TH className="w-12"><span className="sr-only">{t("common.actions")}</span></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`${base}/${r.id}`} className="whitespace-nowrap font-mono text-xs font-semibold text-primary hover:underline">{r.reference}</Link>
                  </TD>
                  <TD>
                    <div className="font-medium">{r.contact_name}</div>
                    <div className="text-xs text-muted-foreground">{r.contact_company ? `${r.contact_company} · ` : ""}{r.contact_email}</div>
                  </TD>
                  <TD className="whitespace-nowrap text-sm">
                    {formatBookingRange(f, r.start_at, r.end_at)}
                    <div className="text-xs text-muted-foreground">{t("requests.hoursCount", { count: r.duration_hours })}</div>
                  </TD>
                  <TD className="tabular-nums">{r.participants}</TD>
                  <TD className="hidden lg:table-cell text-sm">
                    {roomOf(r) ?? <span className="text-muted-foreground">{t("requests.noRoom")}</span>}
                    {!(r.assigned_room as unknown) && roomOf(r) ? <div className="text-xs text-muted-foreground">{t("requests.preferred")}</div> : null}
                  </TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">{price(r)}{r.price_adjusted ? <span className="ml-1 text-xs text-muted-foreground">*</span> : null}</TD>
                  <TD><StatusBadge kind="request" value={r.status} /></TD>
                  <TD className="hidden xl:table-cell whitespace-nowrap text-sm text-muted-foreground">{f.dateTime(new Date(r.created_at), "dateTime")}</TD>
                  <TD>
                    <Link href={`${base}/${r.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`${t("common.open")} ${r.reference}`}>
                      <ChevronRight />
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
      <Pagination page={page} total={count ?? 0} perPage={PER_PAGE} makeHref={(p) => buildHref(base, { ...keep, page: p })} />
    </>
  );
}
