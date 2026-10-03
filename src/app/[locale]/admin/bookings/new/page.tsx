import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { BookingCreateForm } from "@/components/admin/booking-create-form";
import { loadCalendarSettings, loadResourceOptions } from "@/lib/admin/queries";
import type { Locale } from "@/i18n/routing";

type SP = { type?: string; resource?: string; date?: string; start?: string; end?: string };

export default async function NewBookingPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin" });
  const [resources, settings] = await Promise.all([loadResourceOptions(), loadCalendarSettings()]);
  return (
    <>
      <AdminPageHeader title={t("bookings.createTitle")} subtitle={t("bookings.createSubtitle")} back={{ href: `/${locale}/admin/bookings`, label: t("nav.bookings") }} />
      <BookingCreateForm resources={resources} settings={settings} initial={sp} />
    </>
  );
}
