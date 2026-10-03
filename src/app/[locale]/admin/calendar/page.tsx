import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AdminCalendar } from "@/components/admin/admin-calendar";
import { buttonVariants } from "@/components/ui/button";
import { loadCalendarSettings, loadResourceOptions } from "@/lib/admin/queries";
import type { Locale } from "@/i18n/routing";

export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "admin" });
  const [resources, settings] = await Promise.all([loadResourceOptions(), loadCalendarSettings()]);
  return (
    <>
      <AdminPageHeader
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
        actions={
          <Link href={`/${locale}/admin/bookings/new`} className={buttonVariants()}>
            <Plus /> {t("bookings.new")}
          </Link>
        }
      />
      <AdminCalendar resources={resources} settings={settings} />
    </>
  );
}
