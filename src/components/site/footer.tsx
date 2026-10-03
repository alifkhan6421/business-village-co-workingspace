import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Mail, MapPin, Phone } from "lucide-react";
import { getNavigation, getSiteSettings } from "@/lib/cms";
import { localizeHref } from "@/lib/href";
import { pickLocalized } from "@/lib/localize";
import type { Locale } from "@/i18n/routing";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const [nav, settings, t] = await Promise.all([
    getNavigation(locale),
    getSiteSettings(locale),
    getTranslations({ locale, namespace: "nav" }),
  ]);
  const s = settings as unknown as Record<string, unknown>;
  const description = pickLocalized(s, "footer_description", locale);
  const copyright = pickLocalized(s, "footer_copyright", locale).replace("{year}", String(new Date().getFullYear()));
  const hours = pickLocalized(s, "opening_hours", locale);
  const social = (Array.isArray(settings.social_links) ? settings.social_links : []) as { label?: string; url?: string }[];
  const logo = settings.footerLogo ?? settings.logo;

  return (
    <footer className="mt-16 border-t bg-secondary/40" data-testid="site-footer">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          {logo ? (
            <Image src={logo.url} alt={logo.alt || settings.company_name} width={logo.width ?? 160} height={logo.height ?? 40} className="h-9 w-auto" />
          ) : (
            <p className="text-lg font-semibold">{settings.company_name}</p>
          )}
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">{t("explore")}</h2>
          <ul className="space-y-2 text-sm">
            {nav.footer.map((i) => (
              <li key={i.id}>
                <a href={localizeHref(i.href, locale)} target={i.newTab ? "_blank" : undefined} rel={i.newTab ? "noopener noreferrer" : undefined} className="text-muted-foreground hover:text-foreground">
                  {i.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">{t("contact")}</h2>
          <ul className="space-y-2 text-sm text-muted-foreground" data-testid="footer-contact">
            {settings.address_line_1 ? (
              <li className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {settings.address_line_1}
                  {settings.address_line_2 ? <>, {settings.address_line_2}</> : null}
                  <br />
                  {settings.postcode} {settings.city}
                </span>
              </li>
            ) : null}
            {settings.phone ? (
              <li className="flex gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0" />
                <a href={`tel:${settings.phone.replace(/[^+0-9]/g, "")}`} className="hover:text-foreground">{settings.phone}</a>
              </li>
            ) : null}
            {settings.general_email ? (
              <li className="flex gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <a href={`mailto:${settings.general_email}`} className="hover:text-foreground">{settings.general_email}</a>
              </li>
            ) : null}
            {hours ? <li className="whitespace-pre-line pt-1">{hours}</li> : null}
          </ul>
        </div>
        <div>
          {social.length ? (
            <>
              <h2 className="mb-3 text-sm font-semibold">{t("followUs")}</h2>
              <ul className="mb-6 space-y-2 text-sm">
                {social.filter((l) => l.url?.startsWith("https://")).map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">{l.label || l.url}</a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h2 className="mb-3 text-sm font-semibold">{t("legal")}</h2>
          <ul className="space-y-2 text-sm">
            {nav.legal.map((i) => (
              <li key={i.id}>
                <a href={localizeHref(i.href, locale)} className="text-muted-foreground hover:text-foreground">{i.label}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted-foreground sm:px-6">{copyright}</p>
      </div>
    </footer>
  );
}
