import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ListFilters, Pagination, buildHref, searchTerm } from "@/components/admin/list-tools";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import type { Locale } from "@/i18n/routing";

const PER_PAGE = 25;

export default async function GuestsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const [t, f] = await Promise.all([getTranslations({ locale, namespace: "admin" }), getFormatter({ locale })]);
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabase.from("guests").select("*, bookings(start_at)", { count: "exact" }).order("created_at", { ascending: false });
  const term = searchTerm(sp.q);
  if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`);
  const { data, count } = await q.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const base = `/${locale}/admin/guests`;
  return (
    <>
      <AdminPageHeader title={t("guests.title")} subtitle={t("guests.subtitle")} />
      <ListFilters q={sp.q} placeholder={t("guests.searchPlaceholder")} />
      {(data ?? []).length === 0 ? (
        <EmptyState title={t("common.noResults")} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("common.name")}</TH>
              <TH className="hidden md:table-cell">{t("common.phone")}</TH>
              <TH className="hidden md:table-cell">{t("common.company")}</TH>
              <TH>{t("common.bookingsCount")}</TH>
              <TH className="hidden lg:table-cell">{t("guests.lastBooking")}</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((g) => {
              const bs = (g.bookings as { start_at: string }[]) ?? [];
              const last = bs.map((b) => b.start_at).sort().at(-1);
              return (
                <TR key={g.id}>
                  <TD>
                    <Link href={`${base}/${g.id}`} className="font-medium hover:underline">{g.first_name} {g.last_name}</Link>
                    <div className="text-xs text-muted-foreground">{g.email}</div>
                  </TD>
                  <TD className="hidden md:table-cell">{g.phone || "—"}</TD>
                  <TD className="hidden md:table-cell">{g.company || "—"}</TD>
                  <TD>{bs.length}</TD>
                  <TD className="hidden lg:table-cell text-sm text-muted-foreground">{last ? f.dateTime(new Date(last), "short") : "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <Pagination page={page} total={count ?? 0} perPage={PER_PAGE} makeHref={(p) => buildHref(base, { q: sp.q, page: p })} />
    </>
  );
}
