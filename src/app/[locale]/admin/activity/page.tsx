import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ListFilters, Pagination, buildHref } from "@/components/admin/list-tools";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import type { Locale } from "@/i18n/routing";

const PER_PAGE = 50;

function summary(meta: Record<string, unknown>) {
  const parts: string[] = [];
  for (const k of ["label", "reference", "title", "reason", "slug", "key", "status", "role"]) if (meta[k] !== undefined && meta[k] !== null) parts.push(String(meta[k]));
  return parts.join(" · ");
}

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ action?: string; page?: string }> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const [t, f] = await Promise.all([getTranslations({ locale, namespace: "admin.activity" }), getFormatter({ locale })]);
  const tc = await getTranslations({ locale, namespace: "admin.common" });
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (sp.action && /^[A-Z_]+$/.test(sp.action)) q = q.eq("action", sp.action);
  const { data, count } = await q.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const actorIds = [...new Set((data ?? []).map((a) => a.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const names = new Map((actors ?? []).map((a) => [a.id, a.full_name || a.email]));
  const actions = Object.keys(t.raw("actions") as Record<string, string>);
  return (
    <>
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />
      <ListFilters
        filters={[{ name: "action", value: sp.action ?? "all", label: t("action"), options: [{ value: "all", label: `${t("action")}: ${tc("filterAll")}` }, ...actions.map((a) => ({ value: a, label: t(`actions.${a}`) }))] }]}
      />
      {(data ?? []).length === 0 ? (
        <EmptyState title={tc("noResults")} />
      ) : (
        <Table stack>
          <THead>
            <TR>
              <TH>{tc("date")}</TH>
              <TH>{t("action")}</TH>
              <TH className="hidden md:table-cell">{t("entity")}</TH>
              <TH>{t("actor")}</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-sm text-muted-foreground">{f.dateTime(new Date(a.created_at), "dateTime")}</TD>
                <TD className="font-medium">{t.has(`actions.${a.action}`) ? t(`actions.${a.action}`) : a.action}</TD>
                <TD className="hidden max-w-sm truncate text-sm md:table-cell">{summary((a.metadata ?? {}) as Record<string, unknown>) || a.entity_type}</TD>
                <TD className="text-sm">{a.actor_id ? names.get(a.actor_id) ?? "—" : a.actor_label === "guest" ? t("guestActor") : a.actor_label ?? t("system")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} total={count ?? 0} perPage={PER_PAGE} makeHref={(p) => buildHref(`/${locale}/admin/activity`, { action: sp.action, page: p })} />
    </>
  );
}
