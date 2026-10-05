import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { localizeHref } from "@/lib/href";
import { AccountTabs, type AccountNavItem } from "@/components/account/account-tabs";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const { profile } = await requireUser(locale, localizeHref("/account", locale));
  const t = await getTranslations({ locale, namespace: "account" });
  const profileHref = localizeHref("/account/profile", locale);
  const tabs: AccountNavItem[] = [
    { href: localizeHref("/account", locale), label: t("dashboard"), icon: "dashboard", exact: true },
    { href: localizeHref("/account/bookings", locale), label: t("bookings"), icon: "bookings" },
    { href: localizeHref("/coworking", locale), label: t("spaces"), icon: "spaces" },
    { href: profileHref, label: t("profile"), icon: "profile" },
    { href: `${profileHref}#settings`, label: t("settings"), icon: "settings" },
  ];
  const name = profile.full_name || profile.email;
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <div className="mb-4 hidden items-center gap-3 rounded-xl border bg-surface p-3 lg:flex">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{initials}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <AccountTabs tabs={tabs} label={t("menu")} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
