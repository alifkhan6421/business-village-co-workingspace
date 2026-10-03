import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ListFilters, Pagination, buildHref, searchTerm } from "@/components/admin/list-tools";
import { StatusBadge } from "@/components/admin/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { buttonVariants } from "@/components/ui/button";
import { BOOKING_SELECT, customerOf, resourceName, type AdminBooking } from "@/lib/admin/queries";
import { formatBookingRange } from "@/lib/format-range";
import type { Locale } from "@/i18n/routing";

const PER_PAGE = 25;
type SP = { q?: string; status?: string; type?: string; customer?: string; when?: string; page?: string };

export default async function BookingsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const [t, ts, tt, f] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "status" }),
    getTranslations({ locale, namespace: "status.bookingType" }),
    getFormatter({ locale }),
  ]);
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  const when = sp.when ?? "upcoming";

  let query = supabase.from("bookings").select(BOOKING_SELECT, { count: "exact" });
  const now = new Date().toISOString();
  if (when === "upcoming") query = query.gte("end_at", now).order("start_at", { ascending: true });
  else if (when === "past") query = query.lt("end_at", now).order("start_at", { ascending: false });
  else query = query.order("start_at", { ascending: false });
  if (sp.status && sp.status !== "all") query = query.eq("status", sp.status);
  if (sp.type === "workspace" || sp.type === "room") query = query.eq("booking_type", sp.type);
  if (sp.customer === "member") query = query.not("user_id", "is", null);
  if (sp.customer === "guest") query = query.is("user_id", null);

  const term = searchTerm(sp.q);
  if (term) {
    const like = `%${term}%`;
    const [g, p, w, r] = await Promise.all([
      supabase.from("guests").select("id").or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},company.ilike.${like}`).limit(200),
      supabase.from("profiles").select("id").or(`full_name.ilike.${like},email.ilike.${like},company.ilike.${like}`).limit(200),
      supabase.from("workspaces").select("id").ilike("name", like),
      supabase.from("rooms").select("id").ilike("name", like),
    ]);
    const ors = [`booking_reference.ilike.${like}`];
    const ids = (rows: { id: string }[] | null) => (rows ?? []).map((x) => x.id).join(",");
    if (g.data?.length) ors.push(`guest_id.in.(${ids(g.data)})`);
    if (p.data?.length) ors.push(`user_id.in.(${ids(p.data)})`);
    if (w.data?.length) ors.push(`workspace_id.in.(${ids(w.data)})`);
    if (r.data?.length) ors.push(`room_id.in.(${ids(r.data)})`);
    query = query.or(ors.join(","));
  }
  const { data, count } = await query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const rows = (data ?? []) as unknown as AdminBooking[];
  const base = `/${locale}/admin/bookings`;
  const keep = { q: sp.q, status: sp.status, type: sp.type, customer: sp.customer, when };

  return (
    <>
      <AdminPageHeader
        title={t("bookings.title")}
        subtitle={t("bookings.subtitle")}
        actions={
          <Link href={`${base}/new`} className={buttonVariants()}>
            <Plus /> {t("bookings.new")}
          </Link>
        }
      />
      <ListFilters
        q={sp.q}
        placeholder={t("bookings.searchPlaceholder")}
        filters={[
          {
            name: "when",
            value: when,
            label: t("bookings.when"),
            options: [
              { value: "upcoming", label: t("bookings.upcoming") },
              { value: "past", label: t("bookings.past") },
              { value: "all", label: t("common.filterAll") },
            ],
          },
          {
            name: "status",
            value: sp.status ?? "all",
            label: t("common.status"),
            options: [{ value: "all", label: `${t("common.status")}: ${t("common.filterAll")}` }, ...["pending", "confirmed", "cancelled", "completed", "no_show"].map((s) => ({ value: s, label: ts(`booking.${s}`) }))],
          },
          {
            name: "type",
            value: sp.type ?? "all",
            label: t("common.type"),
            options: [{ value: "all", label: `${t("common.type")}: ${t("common.filterAll")}` }, { value: "workspace", label: tt("workspace") }, { value: "room", label: tt("room") }],
          },
          {
            name: "customer",
            value: sp.customer ?? "all",
            label: t("bookings.customerType"),
            options: [{ value: "all", label: `${t("bookings.customerType")}: ${t("common.filterAll")}` }, { value: "member", label: t("bookings.member") }, { value: "guest", label: t("bookings.guest") }],
          },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title={t("common.noResults")} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("bookings.reference")}</TH>
              <TH>{t("common.customer")}</TH>
              <TH>{t("common.resource")}</TH>
              <TH>{t("bookings.when")}</TH>
              <TH>{t("common.status")}</TH>
              <TH className="hidden lg:table-cell">{t("bookings.source")}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((b) => {
              const c = customerOf(b);
              return (
                <TR key={b.id}>
                  <TD>
                    <Link href={`${base}/${b.id}`} className="whitespace-nowrap font-mono text-xs font-semibold text-primary hover:underline">
                      {b.booking_reference}
                    </Link>
                  </TD>
                  <TD>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.email} · <Badge variant={c.kind === "member" ? "secondary" : "outline"}>{c.kind === "member" ? t("bookings.member") : t("bookings.guest")}</Badge>
                    </div>
                  </TD>
                  <TD>
                    {resourceName(b)}
                    <div className="text-xs text-muted-foreground">{tt(b.booking_type)}</div>
                  </TD>
                  <TD className="whitespace-nowrap text-sm">{formatBookingRange(f, b.start_at, b.end_at)}</TD>
                  <TD>
                    <StatusBadge kind="booking" value={b.status} />
                  </TD>
                  <TD className="hidden lg:table-cell text-sm text-muted-foreground">{ts(`source.${b.source}`)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <Pagination page={page} total={count ?? 0} perPage={PER_PAGE} makeHref={(p) => buildHref(base, { ...keep, page: p })} />
    </>
  );
}
