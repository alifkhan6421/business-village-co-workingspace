import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getNavigation, getSiteSettings } from "@/lib/cms";
import { localizeHref } from "@/lib/href";
import { pickLocalized } from "@/lib/localize";
import type { Locale } from "@/i18n/routing";
import { Brand } from "./brand";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const [nav, settings, current, t] = await Promise.all([
    getNavigation(locale),
    getSiteSettings(locale),
    getCurrentUser(),
    getTranslations({ locale, namespace: "nav" }),
  ]);
  const items = nav.header.map((i) => ({ ...i, href: localizeHref(i.href, locale) }));
  const banner = pickLocalized(settings as unknown as Record<string, unknown>, "announcement_banner", locale);
  const bookHref = localizeHref("/coworking", locale);
  const loginHref = localizeHref("/login", locale);
  const signupHref = localizeHref("/signup", locale);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      {banner ? (
        <div className="bg-primary px-4 py-2 text-center text-[13px] font-medium text-primary-foreground" data-testid="site-banner">
          {banner}
        </div>
      ) : null}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:h-[72px]">
        <a href={`/${locale}`} className="flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="site-logo">
          <Brand logo={settings.logo} name={settings.company_name} priority />
        </a>
        <nav aria-label={t("mainNavigation")} className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          <NavLinks items={items} />
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <LanguageSwitcher className="hidden md:flex" />
          {current ? (
            <UserMenu
              name={current.profile.full_name ?? ""}
              email={current.profile.email}
              isAdmin={current.profile.role === "admin"}
            />
          ) : (
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <a href={loginHref}>{t("login")}</a>
            </Button>
          )}
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <a href={bookHref}>{t("bookNow")}</a>
          </Button>
          <MobileNav
            title={settings.company_name}
            items={items.map((i) => ({ ...i, active: false }))}
            bookHref={bookHref}
            bookLabel={t("bookNow")}
            auth={current ? null : { loginHref, loginLabel: t("login"), signupHref, signupLabel: t("signup") }}
          />
        </div>
      </div>
    </header>
  );
}
