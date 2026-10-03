import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getNavigation, getSiteSettings } from "@/lib/cms";
import { localizeHref } from "@/lib/href";
import { pickLocalized } from "@/lib/localize";
import type { Locale } from "@/i18n/routing";
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

  const authActions = current ? null : (
    <>
      <Button asChild variant="ghost" size="sm">
        <a href={localizeHref("/login", locale)}>{t("login")}</a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={localizeHref("/signup", locale)}>{t("signup")}</a>
      </Button>
    </>
  );
  const bookButton = (
    <Button asChild size="sm">
      <a href={localizeHref("/coworking", locale)}>{t("bookWorkspace")}</a>
    </Button>
  );

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      {banner ? (
        <div className="bg-primary px-4 py-2 text-center text-sm text-primary-foreground" data-testid="site-banner">
          {banner}
        </div>
      ) : null}
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4 sm:px-6">
        <a href={`/${locale}`} className="flex shrink-0 items-center gap-2 font-semibold" data-testid="site-logo">
          {settings.logo ? (
            <Image
              src={settings.logo.url}
              alt={settings.logo.alt || settings.company_name}
              width={settings.logo.width ?? 160}
              height={settings.logo.height ?? 40}
              className="h-9 w-auto"
              priority
            />
          ) : (
            <>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                BV
              </span>
              <span className="text-lg tracking-tight">{settings.company_name}</span>
            </>
          )}
        </a>
        <nav aria-label={t("mainNavigation")} className="hidden flex-1 items-center justify-center gap-0.5 xl:flex">
          <NavLinks items={items} />
        </nav>
        <div className="ml-auto flex items-center gap-2 xl:ml-0">
          <LanguageSwitcher className="hidden sm:flex" />
          <div className="hidden items-center gap-1 xl:flex">{authActions}</div>
          {current ? (
            <UserMenu
              name={current.profile.full_name ?? ""}
              email={current.profile.email}
              isAdmin={current.profile.role === "admin"}
            />
          ) : null}
          <div className="hidden sm:block">{bookButton}</div>
          <MobileNav
            title={settings.company_name}
            items={items.map((i) => ({ ...i, active: false }))}
            actions={
              <>
                {bookButton}
                {authActions}
              </>
            }
          />
        </div>
      </div>
    </header>
  );
}
