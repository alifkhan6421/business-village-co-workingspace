import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ListFilters, Pagination, buildHref, searchTerm } from "@/components/admin/list-tools";
import { StatusBadge } from "@/components/admin/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { FormAlert } from "@/components/forms/form-alert";
import { emailConfigured } from "@/lib/email/send";
import type { Locale } from "@/i18n/routing";

const PER_PAGE = 30;
const TYPES = ["welcome", "verify_email", "password_reset", "booking_confirmation", "guest_booking_confirmation", "booking_updated", "booking_cancelled", "contact_confirmation", "contact_admin_notification", "booking_admin_notification", "booking_message"];

export default async function EmailLogsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; status?: string; type?: string; page?: string }> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const [t, ts, f] = await Promise.all([getTranslations({ locale, namespace: "admin" }), getTranslations({ locale, namespace: "status.email" }), getFormatter({ locale })]);
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabase.from("email_logs").select("id, email_type, recipient, subject, status, error_message, created_at, locale", { count: "exact" }).order("created_at", { ascending: false });
  const term = searchTerm(sp.q);
  if (term) q = q.or(`recipient.ilike.%${term}%,subject.ilike.%${term}%`);
  if (sp.status && sp.status !== "all") q = q.eq("status", sp.status);
  if (sp.type && TYPES.includes(sp.type)) q = q.eq("email_type", sp.type);
  const { data, count } = await q.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const base = `/${locale}/admin/email-logs`;
  return (
    <>
      <AdminPageHeader title={t("emailLogs.title")} subtitle={t("emailLogs.subtitle")} />
      {!emailConfigured() ? <FormAlert kind="info" className="mb-4">{t("emailLogs.notConfigured")}</FormAlert> : null}
      <ListFilters
        q={sp.q}
        filters={[
          { name: "status", value: sp.status ?? "all", label: t("common.status"), options: [{ value: "all", label: `${t("common.status")}: ${t("common.filterAll")}` }, ...["sent", "failed", "pending"].map((s) => ({ value: s, label: ts(s) }))] },
          { name: "type", value: sp.type ?? "all", label: t("emailLogs.type"), options: [{ value: "all", label: `${t("emailLogs.type")}: ${t("common.filterAll")}` }, ...TYPES.map((x) => ({ value: x, label: t(`emailLogs.types.${x}`) }))] },
        ]}
      />
      {(data ?? []).length === 0 ? (
        <EmptyState title={t("common.noResults")} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("emailLogs.subject")}</TH>
              <TH className="hidden md:table-cell">{t("emailLogs.type")}</TH>
              <TH>{t("common.status")}</TH>
              <TH className="hidden sm:table-cell">{t("common.date")}</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((e) => (
              <TR key={e.id}>
                <TD>
                  <Link href={`${base}/${e.id}`} className="font-medium hover:underline">{e.subject}</Link>
                  <div className="text-xs text-muted-foreground">{e.recipient} · {(e.locale ?? "").toUpperCase()}</div>
                  {e.error_message ? <div className="text-xs text-destructive">{e.error_message}</div> : null}
                </TD>
                <TD className="hidden md:table-cell text-sm">{t.has(`emailLogs.types.${e.email_type}`) ? t(`emailLogs.types.${e.email_type}`) : e.email_type}</TD>
                <TD><StatusBadge kind="email" value={e.status} /></TD>
                <TD className="hidden whitespace-nowrap text-sm text-muted-foreground sm:table-cell">{f.dateTime(new Date(e.created_at), "dateTime")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} total={count ?? 0} perPage={PER_PAGE} makeHref={(p) => buildHref(base, { q: sp.q, status: sp.status, type: sp.type, page: p })} />
    </>
  );
}
