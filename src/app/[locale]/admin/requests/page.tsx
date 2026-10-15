import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarDays, ChevronRight, List } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ListFilters, Pagination, buildHref, searchTerm } from "@/components/admin/list-tools";
import { StatusBadge } from "@/components/admin/status-badge";
import { RequestCalendar } from "@/components/admin/request-calendar";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBookingRange } from "@/lib/format-range";
import { berlinToUtc } from "@/lib/time";
import { loadCalendarSettings } from "@/lib/admin/queries";
import { formatCents, toCents } from "@/lib/pricing/calc";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

const PER_PAGE = 25;
const STATUSES = ["pending", "under_review", "alternative_proposed", "confirmed", "rejected", "cancelled", "completed"];
type SP = { q?: string; status?: string; room?: string; from?: string; to?: string; people?: string; page?: string; view?: string };

export default async function RequestsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const [t, ts, f] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "status.request" }),
    getFormatter({ locale }),
  ]);
  const supabase = await createClient();
  const base = `/${locale}/admin/requests`;
  const view = sp.view === "calendar" ? "calendar" : "list";

  const tabs = (
    <nav className="inline-flex rounded-lg border bg-card p-1" aria-label={t("requests.view")}>
      {(["list", "calendar"] as const).map((v) => (
        <Link
          key={v}
          href={buildHref(base, { view: v === "list" ? undefined : v })}
          aria-current={view === v ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
            view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "list" ? <List className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />} {t(`requests.${v}View`)}
        </Link>
      ))}
    </nav>
  );

  if (view === "calendar") {
    return (
      <>
        <AdminPageHeader title={t("requests.title")} subtitle={t("requests.subtitle")} actions={tabs} />
        <RequestCalendar settings={await loadCalendarSettings()} />
      </>
    );
  }

  const [{ data: rooms }, { data: workspaces }] = await Promise.all([
    supabase.from("rooms").select("id, name").order("display_order").order("name"),
    supabase.from("workspaces").select("id, name").order("display_order").order("name"),
  ]);
  const page = Math.max(1, Number(sp.page) || 1);
  let query = supabase
    .from("booking_requests")
    .select(
      "id, reference, status, space_type, full_name, email, company, start_at, end_at, participants, estimate_gross, price_gross, created_at, room:rooms!booking_requests_assigned_room_id_fkey(name), workspace:workspaces(name)",
      { count: "exact" },
    );
  if (sp.status === "open") query = query.in("status", ["pending", "under_review", "alternative_proposed"]);
  else if (sp.status && STATUSES.includes(sp.status)) query = query.eq("status", sp.status);
  if (sp.room === "unassigned") query = query.is("assigned_room_id", null).is("assigned_workspace_id", null);
  else if (sp.room && /^[0-9a-f-]{36}$/.test(sp.room)) query = query.or(`assigned_room_id.eq.${sp.room},assigned_workspace_id.eq.${sp.room}`);
  const from = sp.from ? berlinToUtc(sp.from, "00:00") : null;
  const to = sp.to ? berlinToUtc(sp.to, "24:00") : null;
  if (from) query = query.gte("start_at", from.toISOString());
  if (to) query = query.lt("start_at", to.toISOString());
  const people = Number(sp.people) || 0;
  if (people > 0) query = query.gte("participants", people);
  const term = searchTerm(sp.q);
  if (term) {
    const like = `%${term}%`;
    query = query.or(`reference.ilike.${like},full_name.ilike.${like},email.ilike.${like},company.ilike.${like}`);
  }
  query = from || to ? query.order("start_at", { ascending: true }) : query.order("created_at", { ascending: false });
  const { data, count } = await query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  type Row = {
    id: string;
    reference: string;
    status: string;
    space_type: string;
    full_name: string;
    email: string;
    company: string | null;
    start_at: string;
    end_at: string;
    participants: number;
    estimate_gross: number | null;
    price_gross: number | null;
    created_at: string;
    room: { name: string } | null;
    workspace: { name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const keep = { q: sp.q, status: sp.status, room: sp.room, from: sp.from, to: sp.to, people: sp.people };
  const price = (r: Row) => {
    const c = toCents(r.price_gross ?? r.estimate_gross);
    return c === null ? "—" : formatCents(c, locale);
  };
  const space = (r: Row) => r.room?.name ?? r.workspace?.name ?? null;

  return (
    <>
      <AdminPageHeader title={t("requests.title")} subtitle={t("requests.subtitle")} actions={tabs} />
      <ListFilters
        q={sp.q}
        placeholder={t("requests.searchPlaceholder")}
        hidden={Object.fromEntries(Object.entries({ from: sp.from, to: sp.to, people: sp.people }).filter(([, v]) => v)) as Record<string, string>}
        filters={[
          {
            name: "status",
            value: sp.status ?? "all",
            label: t("common.status"),
            options: [
              { value: "all", label: `${t("common.status")}: ${t("common.filterAll")}` },
              { value: "open", label: t("requests.open") },
              ...STATUSES.map((s) => ({ value: s, label: ts(s) })),
            ],
          },
          {
            name: "room",
            value: sp.room ?? "all",
            label: t("requests.assignedSpace"),
            options: [
              { value: "all", label: `${t("requests.assignedSpace")}: ${t("common.filterAll")}` },
              { value: "unassigned", label: t("requests.unassigned") },
              ...(rooms ?? []).map((r) => ({ value: r.id, label: r.name })),
              ...(workspaces ?? []).map((w) => ({ value: w.id, label: w.name })),
            ],
          },
        ]}
      />
      <form method="get" className="-mt-2 mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end" aria-label={t("requests.moreFilters")}>
        {Object.entries({ q: sp.q, status: sp.status, room: sp.room }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <label className="block space-y-1 text-xs font-medium text-muted-foreground">
          {t("requests.dateFrom")}
          <Input type="date" name="from" defaultValue={sp.from} className="sm:w-40" />
        </label>
        <label className="block space-y-1 text-xs font-medium text-muted-foreground">
          {t("requests.dateTo")}
          <Input type="date" name="to" defaultValue={sp.to} className="sm:w-40" />
        </label>
        <label className="col-span-2 block space-y-1 text-xs font-medium text-muted-foreground sm:col-span-1">
          {t("requests.minPeople")}
          <Input type="number" name="people" min={1} max={1000} defaultValue={sp.people} className="sm:w-32" />
        </label>
        <button type="submit" className={cn(buttonVariants({ variant: "secondary" }), "col-span-2 sm:col-auto")}>
          {t("requests.apply")}
        </button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={t("common.noResults")} />
      ) : (
        <>
          <ul className="space-y-3 md:hidden" data-testid="request-cards">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`${base}/${r.id}`} className="block rounded-2xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.full_name}</div>
                      <div className="truncate text-sm text-muted-foreground">{r.company || r.email}</div>
                    </div>
                    <StatusBadge kind="request" value={r.status} />
                  </div>
                  <div className="mt-3 text-sm">{formatBookingRange(f, r.start_at, r.end_at)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono font-semibold text-primary">{r.reference}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t("requests.peopleCount", { count: r.participants })}</span>
                    <span aria-hidden="true">·</span>
                    <span>{space(r) ?? t("requests.unassigned")}</span>
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
                <TH>{t("requests.reference")}</TH>
                <TH>{t("common.customer")}</TH>
                <TH>{t("requests.requestedTime")}</TH>
                <TH>{t("requests.people")}</TH>
                <TH>{t("requests.assignedSpace")}</TH>
                <TH>{t("requests.price")}</TH>
                <TH>{t("common.status")}</TH>
                <TH className="hidden xl:table-cell">{t("requests.received")}</TH>
                <TH className="w-12">
                  <span className="sr-only">{t("common.actions")}</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`${base}/${r.id}`} className="whitespace-nowrap font-mono text-xs font-semibold text-primary hover:underline">
                      {r.reference}
                    </Link>
                  </TD>
                  <TD>
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.company ? `${r.company} · ` : ""}
                      {r.email}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-sm">
                    {formatBookingRange(f, r.start_at, r.end_at)}
                    {r.space_type === "workspace" ? <div className="text-xs text-muted-foreground">{t("requests.deskRequest")}</div> : null}
                  </TD>
                  <TD className="text-sm tabular-nums">{r.participants}</TD>
                  <TD className="text-sm">{space(r) ?? <span className="text-muted-foreground">{t("requests.unassigned")}</span>}</TD>
                  <TD className="whitespace-nowrap text-sm tabular-nums">{price(r)}</TD>
                  <TD>
                    <StatusBadge kind="request" value={r.status} />
                  </TD>
                  <TD className="hidden whitespace-nowrap text-sm text-muted-foreground xl:table-cell">{f.dateTime(new Date(r.created_at), "dateTime")}</TD>
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
