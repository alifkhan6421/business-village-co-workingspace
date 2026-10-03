import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AnnouncementForm } from "@/components/admin/people-forms";
import { Card, CardContent } from "@/components/ui/card";
import { TIME_ZONE } from "@/lib/tz";
import type { Locale } from "@/i18n/routing";

const local = (iso: string | null) => (iso ? formatInTimeZone(new Date(iso), TIME_ZONE, "yyyy-MM-dd'T'HH:mm") : "");

export default async function AnnouncementEdit({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  const t = await getTranslations({ locale, namespace: "admin" });
  let values = null;
  if (id !== "new") {
    if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
    const supabase = await createClient();
    const { data: a } = await supabase.from("announcements").select("*").eq("id", id).maybeSingle();
    if (!a) notFound();
    values = { ...a, publish_at: local(a.publish_at), expires_at: local(a.expires_at) };
  }
  return (
    <>
      <AdminPageHeader
        title={values ? t("announcements.edit") : t("announcements.new")}
        subtitle={t("announcements.timeHint")}
        back={{ href: `/${locale}/admin/announcements`, label: t("nav.announcements") }}
      />
      <Card>
        <CardContent className="pt-6">
          <AnnouncementForm a={values} />
        </CardContent>
      </Card>
    </>
  );
}
