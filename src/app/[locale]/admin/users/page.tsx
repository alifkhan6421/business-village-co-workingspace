import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ListFilters, Pagination, buildHref, searchTerm } from "@/components/admin/list-tools";
import { StatusBadge } from "@/components/admin/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type { Locale } from "@/i18n/routing";

const PER_PAGE = 25;

export default async function UsersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const [t, ts, f] = await Promise.all([getTranslations({ locale, namespace: "admin" }), getTranslations({ locale, namespace: "status.role" }), getFormatter({ locale })]);
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabase.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false });
  const term = searchTerm(sp.q);
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`);
  if (sp.role === "admin" || sp.role === "member") q = q.eq("role", sp.role);
  const { data, count } = await q.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const ids = (data ?? []).map((p) => p.id);
  const { data: bookingRows } = ids.length ? await supabase.from("bookings").select("user_id").in("user_id", ids) : { data: [] };
  const counts = new Map<string, number>();
  for (const b of bookingRows ?? []) counts.set(b.user_id!, (counts.get(b.user_id!) ?? 0) + 1);
  // Suspension state lives in Supabase Auth.
  const { data: authUsers } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const banned = new Set((authUsers?.users ?? []).filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).map((u) => u.id));
  const base = `/${locale}/admin/users`;

  return (
    <>
      <AdminPageHeader title={t("users.title")} subtitle={t("users.subtitle")} />
      <ListFilters
        q={sp.q}
        placeholder={t("users.searchPlaceholder")}
        filters={[{ name: "role", value: sp.role ?? "all", label: t("users.role"), options: [{ value: "all", label: `${t("users.role")}: ${t("common.filterAll")}` }, { value: "member", label: ts("member") }, { value: "admin", label: ts("admin") }] }]}
      />
      {(data ?? []).length === 0 ? (
        <EmptyState title={t("common.noResults")} />
      ) : (
        <Table stack>
          <THead>
            <TR>
              <TH>{t("common.name")}</TH>
              <TH className="hidden md:table-cell">{t("common.company")}</TH>
              <TH>{t("users.role")}</TH>
              <TH className="hidden md:table-cell">{t("common.bookingsCount")}</TH>
              <TH className="hidden lg:table-cell">{t("common.createdAt")}</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((p) => (
              <TR key={p.id}>
                <TD>
                  <Link href={`${base}/${p.id}`} className="font-medium hover:underline">{p.full_name || p.email}</Link>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!p.email_verified ? <Badge variant="warning">{t("users.notVerified")}</Badge> : null}
                    {banned.has(p.id) ? <Badge variant="danger">{t("users.deactivated")}</Badge> : null}
                  </div>
                </TD>
                <TD className="hidden md:table-cell">{p.company || "—"}</TD>
                <TD><StatusBadge kind="role" value={p.role} /></TD>
                <TD className="hidden md:table-cell">{counts.get(p.id) ?? 0}</TD>
                <TD className="hidden lg:table-cell text-sm text-muted-foreground">{f.dateTime(new Date(p.created_at), "short")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} total={count ?? 0} perPage={PER_PAGE} makeHref={(p) => buildHref(base, { q: sp.q, role: sp.role, page: p })} />
    </>
  );
}
