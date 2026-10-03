import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { localizeHref } from "@/lib/href";
import { AccountTabs } from "@/components/account/account-tabs";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  await requireUser(locale, localizeHref("/account", locale));
  const t = await getTranslations({ locale, namespace: "account" });
  const tabs = [
    { href: localizeHref("/account", locale), label: t("overview") },
    { href: localizeHref("/account/bookings", locale), label: t("bookings") },
    { href: localizeHref("/account/profile", locale), label: t("profile") },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="text-sm font-medium text-primary">Business Village Workspace</p>
      <AccountTabs tabs={tabs} />
      <div className="mt-8">{children}</div>
    </div>
  );
}
