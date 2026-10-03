import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { DeleteButton } from "@/components/admin/delete-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { buttonVariants } from "@/components/ui/button";
import { deleteAnnouncement } from "@/lib/admin/people";
import type { Locale } from "@/i18n/routing";

export default async function AnnouncementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const [t, f] = await Promise.all([getTranslations({ locale, namespace: "admin" }), getFormatter({ locale })]);
  const supabase = await createClient();
  const { data } = await supabase.from("announcements").select("*").order("publish_at", { ascending: false });
  const now = Date.now();
  const base = `/${locale}/admin/announcements`;
  return (
    <>
      <AdminPageHeader
        title={t("announcements.title")}
        subtitle={t("announcements.subtitle")}
        actions={<Link href={`${base}/new`} className={buttonVariants()}><Plus /> {t("announcements.new")}</Link>}
      />
      {(data ?? []).length === 0 ? (
        <EmptyState title={t("announcements.empty")} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("announcements.titleField")}</TH>
              <TH>{t("common.status")}</TH>
              <TH className="hidden md:table-cell">{t("announcements.publishAt")}</TH>
              <TH className="hidden md:table-cell">{t("common.translationStatus")}</TH>
              <TH className="text-right">{t("common.actions")}</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((a) => {
              const state = !a.active ? "inactive" : new Date(a.publish_at).getTime() > now ? "scheduled" : a.expires_at && new Date(a.expires_at).getTime() < now ? "expired" : "live";
              return (
                <TR key={a.id}>
                  <TD><Link href={`${base}/${a.id}`} className="font-medium hover:underline">{a.title_de}</Link></TD>
                  <TD><Badge variant={state === "live" ? "success" : state === "scheduled" ? "info" : "muted"}>{t(`announcements.${state}`)}</Badge></TD>
                  <TD className="hidden md:table-cell text-sm text-muted-foreground">{f.dateTime(new Date(a.publish_at), "dateTime")}{a.expires_at ? ` – ${f.dateTime(new Date(a.expires_at), "dateTime")}` : ""}</TD>
                  <TD className="hidden md:table-cell">{a.title_en ? <Badge variant="success">EN ✓</Badge> : <Badge variant="warning">{t("common.missingTranslation")}</Badge>}</TD>
                  <TD className="text-right"><DeleteButton action={deleteAnnouncement.bind(null, a.id)} name={a.title_de} /></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
