import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ListFilters, Pagination, buildHref, searchTerm } from "@/components/admin/list-tools";
import { StatusBadge } from "@/components/admin/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import type { Locale } from "@/i18n/routing";

const PER_PAGE = 25;

export default async function InquiriesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const [t, ts, f] = await Promise.all([getTranslations({ locale, namespace: "admin" }), getTranslations({ locale, namespace: "status.inquiry" }), getFormatter({ locale })]);
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabase.from("contact_requests").select("*", { count: "exact" }).order("created_at", { ascending: false });
  const term = searchTerm(sp.q);
  if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%,message.ilike.%${term}%,company.ilike.%${term}%`);
  if (sp.status && sp.status !== "all") q = q.eq("status", sp.status);
  const { data, count } = await q.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const base = `/${locale}/admin/inquiries`;
  return (
    <>
      <AdminPageHeader title={t("inquiries.title")} subtitle={t("inquiries.subtitle")} />
      <ListFilters
        q={sp.q}
        placeholder={t("inquiries.searchPlaceholder")}
        filters={[{ name: "status", value: sp.status ?? "all", label: t("common.status"), options: [{ value: "all", label: `${t("common.status")}: ${t("common.filterAll")}` }, ...["new", "in_progress", "resolved"].map((s) => ({ value: s, label: ts(s) }))] }]}
      />
      {(data ?? []).length === 0 ? (
        <EmptyState title={t("common.noResults")} />
      ) : (
        <Table stack>
          <THead>
            <TR>
              <TH>{t("common.name")}</TH>
              <TH className="hidden md:table-cell">{t("inquiries.message")}</TH>
              <TH>{t("common.status")}</TH>
              <TH className="hidden sm:table-cell">{t("inquiries.received")}</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((i) => (
              <TR key={i.id}>
                <TD>
                  <Link href={`${base}/${i.id}`} className="font-medium hover:underline">{i.name}</Link>
                  <div className="text-xs text-muted-foreground">{i.email}</div>
                </TD>
                <TD className="hidden max-w-md truncate md:table-cell">{i.message}</TD>
                <TD><StatusBadge kind="inquiry" value={i.status} /></TD>
                <TD className="hidden whitespace-nowrap text-sm text-muted-foreground sm:table-cell">{f.dateTime(new Date(i.created_at), "dateTime")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} total={count ?? 0} perPage={PER_PAGE} makeHref={(p) => buildHref(base, { q: sp.q, status: sp.status, page: p })} />
    </>
  );
}
